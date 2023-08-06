import assert from 'assert';
import { join, relative } from 'path';
import type { AnyZodObject, TypeOf, ZodEffects, ZodRawShape } from 'zod';
import { z, ZodFirstPartyTypeKind } from 'zod';
import { ZodError } from 'zod';

import { AbortError } from '../errors/abortError';
import { handleExceptionsAsync } from '../utils/handleExceptions';
import { hasOneElement } from '../utils/hasOne';
import { isTruthy } from '../utils/isTruthy';
import { retry, type RetryOpts } from '../utils/retry';
import { UnreachableError } from '../utils/UnreachableError';
import { defaultDeps } from './dependencies';
import { loadResult, saveResult } from './persistence';
import type { TransformState } from './state';
import { getTransformState, initializeTransformState } from './state';
import type { AnyPipelineElement, PipelineApi } from './types';

const augmentHeadSchema = <T extends AnyZodObject | ZodEffects<AnyZodObject>>(
    schema: T,
    augmentation: ZodRawShape
) => {
    switch (schema._def.typeName) {
        case ZodFirstPartyTypeKind.ZodObject:
            return (schema as AnyZodObject).augment(augmentation);
        case ZodFirstPartyTypeKind.ZodEffects: {
            const typed = schema as ZodEffects<AnyZodObject>;
            return z.ZodEffects.create(
                typed.innerType().augment(augmentation),
                typed._def.effect
            );
        }
        default:
            throw new UnreachableError(
                schema._def,
                'Cannot augment non-object schemas'
            );
    }
};

const clean = async (
    persistence: { location: string },
    elements: Array<AnyPipelineElement>,
    deps = defaultDeps
) => {
    const { logger, unlink, fg } = deps;

    const state = getTransformState(persistence);
    if (!state || state.results.size === 0) {
        return;
    }

    const { log } = state;

    logger.info('Cleaning', persistence.location);

    const patterns = elements.map(({ name }) => `${name}-*.yaml`);

    /**
     * Filter out sub-directory entries from the log
     */
    const ignore = log.map((entry) => relative(persistence.location, entry));

    const entries = await fg(patterns, {
        cwd: persistence.location,
        ignore,
    });

    for (const entry of entries) {
        logger.info(`Deleting "${join(persistence.location, entry)}"`);

        await unlink(join(persistence.location, entry));
    }
};

async function transformElement(
    params: {
        element: AnyPipelineElement & {
            combine?: (value: unknown, previousValue: unknown) => unknown;
        };
        elements: (AnyPipelineElement & {
            combine?: (value: unknown, previousValue: unknown) => unknown;
        })[];
        elementIndex: number;
        input: unknown;
        persistence: { location: string } | undefined;
        finalResultSchema: AnyZodObject;
        combineAll: (value: unknown, previousValue: unknown) => unknown;
    },
    deps = defaultDeps
) {
    const {
        element,
        persistence,
        elementIndex,
        elements,
        input,
        finalResultSchema,
        combineAll,
    } = params;
    const { logger, fg, hash } = deps;

    const { transform, name, combine, inputSchema, resultSchema } = element;

    const { results, log } = initializeTransformState(persistence);

    const previousElement =
        elementIndex - 1 >= 0 ? elements[elementIndex - 1] : undefined;

    const nextElement =
        elementIndex + 1 < elements.length
            ? elements[elementIndex + 1]
            : {
                  inputSchema: finalResultSchema,
                  combine: undefined,
                  name: undefined,
              };

    assert(nextElement);

    const value = await handleExceptionsAsync(
        () => inputSchema.parseAsync(input),
        (err: unknown) => {
            if (err instanceof ZodError) {
                if (!previousElement) {
                    throw new Error(
                        `Initial input doesn't pass the schema validation for step "${name}"`,
                        {
                            cause: err,
                        }
                    );
                } else {
                    throw new Error(
                        `Result of the call to "${previousElement.name}" doesn't pass schema validation for step "${name}"`,
                        {
                            cause: err,
                        }
                    );
                }
            }
            throw err;
        }
    );

    const valueHash = hash(value);
    const elementId = [name, valueHash].join('-');
    const id = persistence?.location
        ? join(persistence.location, elementId)
        : elementId;

    const foundResult =
        results.get(id) ||
        (await handleExceptionsAsync(
            async () => {
                if (!persistence) {
                    return undefined;
                }

                const entries = await fg([`${elementId}*.yaml`], {
                    cwd: persistence.location,
                    ignore: [],
                });

                const entry = entries.find(isTruthy);
                if (!entry) {
                    return undefined;
                }

                return await loadResult(
                    {
                        location: join(persistence.location, entry),
                        schema: resultSchema,
                    },
                    deps
                );
            },
            (err) => {
                if (err instanceof ZodError) {
                    return undefined;
                } else if (
                    typeof err === 'object' &&
                    err &&
                    'code' in err &&
                    err.code === 'ENOENT'
                ) {
                    return undefined;
                } else {
                    throw err;
                }
            }
        ));

    const foundValidResult =
        foundResult &&
        nextElement.inputSchema.safeParse(
            (nextElement.combine ?? combineAll)(input as object, foundResult)
        );

    if (foundValidResult && foundValidResult.success) {
        logger.info(
            `Step "${name}" with the same input hash "${valueHash}" has already been run ...`
        );
    } else {
        if (!foundValidResult) {
            logger.info(
                `Starting step "${name}" with input hash "${valueHash}" ...`
            );
        } else if (nextElement.name) {
            logger.info(
                `Starting step "${name}" with input hash "${valueHash}" because currently persisted result is not compatible with next step "${String(
                    nextElement.name
                )}" ...`,
                foundValidResult.error
            );
        } else {
            logger.info(
                `Starting step "${name}" with input hash "${valueHash}" because currently persisted result is not compatible with result schema ...`,
                foundValidResult.error
            );
        }
    }

    const result =
        foundValidResult && foundValidResult.success
            ? foundResult
            : await transform(
                  ...([
                      value,
                      persistence?.location
                          ? ({
                                ...persistence,
                                location: join(persistence.location, elementId),
                            } as { location: string })
                          : undefined,
                  ].filter(isTruthy) as Parameters<typeof transform>)
              );

    results.set(id, result);

    if (persistence?.location) {
        const location = join(
            persistence.location,
            [elementId, '.yaml'].join('')
        );
        try {
            await saveResult(
                {
                    input: value,
                    inputSchema,
                    result,
                    location,
                    resultSchema,
                },
                deps
            );
            log.push(location);
        } catch (err) {
            if (err instanceof ZodError) {
                throw new Error(
                    `Result of the call to "${name}" doesn't pass its own schema validation`,
                    {
                        cause: err,
                    }
                );
            }
            throw err;
        }
    }

    const nextCombinedValue = (combine ?? combineAll)(input as object, result);

    logger.debug(`Current state`, nextCombinedValue);

    return nextCombinedValue;
}

const transform = async <
    InputSchema extends AnyZodObject | ZodEffects<AnyZodObject>
>(
    params: {
        elements: Array<
            AnyPipelineElement & {
                combine?: (value: unknown, previousValue: unknown) => unknown;
            }
        >;
        combineAll: (value: unknown, previousValue: unknown) => unknown;
        finalResultSchema: AnyZodObject;
        initialInput: z.input<InputSchema>;
        persistence?: {
            location: string;
        };
    },
    deps = defaultDeps
) => {
    const {
        elements,
        combineAll,
        finalResultSchema,
        initialInput,
        persistence,
    } = params;

    const result = await elements.reduce<Promise<unknown>>(
        async (nextInput, element, elementIndex) => {
            const input = await nextInput;

            return await transformElement(
                {
                    element,
                    elements,
                    elementIndex,
                    input,
                    persistence,
                    finalResultSchema,
                    combineAll,
                },
                deps
            );
        },
        Promise.resolve(initialInput)
    );

    return result;
};

let abort = false;

type PipelineOpts = {
    initialInputSchema: AnyZodObject | ZodEffects<AnyZodObject>;
    deps: typeof defaultDeps;
    elements: Array<
        AnyPipelineElement & {
            combine?: typeof Object.assign;
        }
    >;
    finalResultSchema: AnyZodObject;
    combineAll: (first: unknown, second: unknown) => unknown;
    retryOpts: RetryOpts;
};

const createPipeline = <
    InputSchema extends AnyZodObject | ZodEffects<AnyZodObject>
>(
    optsRaw: Partial<PipelineOpts> & {
        initialInputSchema: AnyZodObject | ZodEffects<AnyZodObject>;
    }
) => {
    const {
        retryOpts = {
            maxAttempts: 1,
        },
        ...opts
    } = {
        deps: defaultDeps,
        elements: [],
        finalResultSchema:
            'sourceType' in optsRaw.initialInputSchema
                ? optsRaw.initialInputSchema.sourceType()
                : optsRaw.initialInputSchema,
        combineAll: (first: unknown, second: unknown) =>
            Object.assign({}, first, second) as unknown,
        ...optsRaw,
    };

    let state: TransformState | undefined;

    const api: PipelineApi<
        InputSchema,
        TypeOf<InputSchema>,
        TypeOf<InputSchema>
    > = {
        append: (element: AnyPipelineElement) => {
            return createPipeline({
                ...opts,
                elements: [...opts.elements, element],
                finalResultSchema: opts.finalResultSchema.merge(
                    element.resultSchema
                ),
            });
        },
        combineLast: (
            reducer: (previous: unknown, next: unknown) => unknown,
            newResultSchema?: AnyZodObject
        ) => {
            const lastElement = opts.elements[opts.elements.length - 1];
            if (!lastElement) {
                throw new Error('No elements in pipeline to combine with');
            }
            return createPipeline({
                ...opts,
                elements: [
                    ...opts.elements.slice(0, opts.elements.length - 1),
                    {
                        ...lastElement,
                        combine: reducer,
                        name: lastElement.name,
                    },
                ],
                finalResultSchema: newResultSchema ?? opts.finalResultSchema,
            });
        },
        combineAll: (
            newCombineAll: (previous: unknown, next: unknown) => unknown,
            newResultSchema?: AnyZodObject
        ) => {
            return createPipeline({
                ...opts,
                combineAll: newCombineAll,
                finalResultSchema: newResultSchema ?? opts.finalResultSchema,
            });
        },
        retry: (retryOpts: RetryOpts) => {
            const initialInputSchema = augmentHeadSchema(
                opts.initialInputSchema,
                {
                    attempt: z.number().int().positive().default(1),
                }
            );
            return createPipeline({
                ...opts,
                elements: hasOneElement(opts.elements)
                    ? [
                          {
                              ...opts.elements[0],
                              inputSchema: initialInputSchema,
                              name: opts.elements[0].name,
                          },
                          ...opts.elements.slice(1),
                      ]
                    : [],
                initialInputSchema,
                retryOpts,
            });
        },
        transform: async (
            input: z.input<InputSchema>,
            persistence?: { location: string }
        ) => {
            if (!getTransformState(persistence)) {
                state = initializeTransformState(persistence);
            }
            if (abort) {
                throw new AbortError(`Pipeline has been aborted`);
            }
            return await retry((attempt) => {
                const initialInput = {
                    ...input,
                    ...(attempt > 1 && {
                        attempt,
                    }),
                };
                return transform(
                    {
                        initialInput,
                        persistence,
                        ...opts,
                    },
                    opts.deps
                );
            }, retryOpts);
        },
        clean: async (persistence: { location: string }) => {
            await clean(persistence, opts.elements, opts.deps);

            if (
                state &&
                state === getTransformState(persistence) &&
                state.log.length > 0
            ) {
                opts.deps.logger.info(
                    `Full log of the run:\n`,
                    state.log.map((line) => relative(process.cwd(), line))
                );
            }
        },
        abort: () => {
            abort = true;
        },
        get log() {
            return state?.log ?? [];
        },
        get inputSchema() {
            return opts.initialInputSchema;
        },
        get resultSchema() {
            return opts.finalResultSchema;
        },
    } as unknown as PipelineApi<
        InputSchema,
        TypeOf<InputSchema>,
        TypeOf<InputSchema>
    >;

    return api;
};

/**
 * Allows you to build a pipeline of functions that can be executed
 * sequentially. With input of one function being a combination of the
 * output of the previous function and the initial input.
 *
 * The pipeline is persisted to disk after each step, so that it can be
 * resumed later.
 *
 * The `transform` function of each step is executed only if the result
 * of the previous step is not available.
 *
 * The `pipeline.transform` function returns the result of the last step
 * and can be called multiple times.
 */
export const pipeline: <Schema extends AnyZodObject | ZodEffects<AnyZodObject>>(
    inputSchema: Schema,
    deps?: typeof defaultDeps
) => PipelineApi<Schema, TypeOf<Schema>, TypeOf<Schema>> = (
    inputSchema,
    deps = defaultDeps
) => {
    return createPipeline({
        initialInputSchema: inputSchema,
        deps,
    });
};
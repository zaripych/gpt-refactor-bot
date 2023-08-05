import assert from 'assert';
import { join, normalize, relative } from 'path';
import type { AnyZodObject, TypeOf, z, ZodEffects } from 'zod';
import { ZodError, ZodFirstPartyTypeKind } from 'zod';

import { escapeRegExp } from '../utils/escapeRegExp';
import { handleExceptionsAsync } from '../utils/handleExceptions';
import { isTruthy } from '../utils/isTruthy';
import { defaultDeps } from './dependencies';
import { loadResult, saveResult } from './persistence';
import type { TransformState } from './state';
import { getTransformState, initializeTransformState } from './state';
import type { AnyPipelineElement, PipelineApi } from './types';

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

    const regex = () =>
        new RegExp(
            `^${escapeRegExp(normalize(persistence.location + '/'))}`,
            'g'
        );

    const patterns = elements.map(({ name }) => `${name}/${name}-*.yaml`);

    const ignore =
        persistence.location !== './'
            ? log
                  .filter((entry) => regex().test(entry))
                  .map((entry) => entry.replaceAll(regex(), ''))
            : log;

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
    const id = [name, valueHash].join('-');

    const foundResult =
        results.get(id) ||
        (await handleExceptionsAsync(
            async () => {
                if (!persistence) {
                    return undefined;
                }

                const entries = await fg([`${id}*.yaml`], {
                    cwd: join(persistence.location, name),
                    ignore: [],
                });

                const entry = entries.find(isTruthy);
                if (!entry) {
                    return undefined;
                }

                return await loadResult(
                    {
                        location: join(persistence.location, name, entry),
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
                                location: join(persistence.location, name),
                            } as { location: string })
                          : undefined,
                  ].filter(isTruthy) as Parameters<typeof transform>)
              );

    results.set(id, result);

    if (persistence?.location) {
        const location = join(
            persistence.location,
            name,
            [id, '.yaml'].join('')
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
) => PipelineApi<Schema, TypeOf<Schema>, TypeOf<Schema>> = <
    InputSchema extends AnyZodObject | ZodEffects<AnyZodObject>
>(
    initialInputSchema: InputSchema,
    deps = defaultDeps
) => {
    const elements: Array<
        AnyPipelineElement & {
            combine?: typeof Object.assign;
        }
    > = [];
    let finalResultSchema: AnyZodObject =
        'sourceType' in initialInputSchema
            ? initialInputSchema.sourceType()
            : initialInputSchema;
    let combineAll = (first: unknown, second: unknown) =>
        Object.assign({}, first, second) as unknown;
    let state: TransformState | undefined;

    const api: PipelineApi<
        InputSchema,
        TypeOf<InputSchema>,
        TypeOf<InputSchema>
    > = {
        append: (element: AnyPipelineElement) => {
            elements.push(element);
            if (
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                element.resultSchema._def.typeName ===
                ZodFirstPartyTypeKind.ZodObject
            ) {
                finalResultSchema = finalResultSchema.merge(
                    element.resultSchema
                );
            } else {
                throw new Error(`Cannot merge non-object schemas`);
            }

            return api;
        },
        combineLast: (
            reducer: (previous: unknown, next: unknown) => unknown,
            newResultSchema?: AnyZodObject
        ) => {
            const lastElement = elements[elements.length - 1];
            if (lastElement) {
                lastElement.combine = reducer;
            }
            if (newResultSchema) {
                finalResultSchema = newResultSchema;
            }
            return api;
        },
        combineAll: (
            reducer: (previous: unknown, next: unknown) => unknown,
            newResultSchema?: AnyZodObject
        ) => {
            combineAll = reducer;
            if (newResultSchema) {
                finalResultSchema = newResultSchema;
            }
            return api;
        },
        transform: async (
            input: z.input<InputSchema>,
            persistence: { location: string }
        ) => {
            if (!getTransformState(persistence)) {
                state = initializeTransformState(persistence);
            }
            if (abort) {
                throw new Error(`Pipeline has been aborted`);
            }
            return await transform(
                {
                    elements,
                    combineAll,
                    finalResultSchema,
                    persistence,
                    initialInput: input,
                },
                deps
            );
        },
        clean: async (persistence: { location: string }) => {
            await clean(persistence, elements, deps);

            if (
                state &&
                state === getTransformState(persistence) &&
                state.log.length > 0
            ) {
                deps.logger.info(
                    `Full log of the run:\n`,
                    state.log.map((line) => relative(process.cwd(), line))
                );
            }
        },
        abort: () => {
            abort = true;
        },
        get inputSchema() {
            return initialInputSchema;
        },
        get resultSchema() {
            return finalResultSchema;
        },
    } as unknown as PipelineApi<
        InputSchema,
        TypeOf<InputSchema>,
        TypeOf<InputSchema>
    >;

    return api;
};

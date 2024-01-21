import assert from 'assert';
import { defer, lastValueFrom } from 'rxjs';
import type { TypeOf } from 'zod';
import { z } from 'zod';

import type { ActionCreatorWithSchema } from '../event-bus';
import { declareActionWithSchema } from '../event-bus';
import { ofTypes } from '../event-bus/operators';
import { captureStackTrace } from '../utils/captureStackTrace';
import { kebabCaseToLowerCamelCase } from '../utils/lowerCamelCaseToKebabCase';
import { defaultDeps } from './dependencies';
import { makeCachedObservable } from './makeCachedObservable';
import type { CacheStateRef, SupportedZodSchemas } from './types';

type KebabCaseToLowerCamelCase<T extends string> =
    T extends `${infer A}-${infer B}`
        ? `${Lowercase<A>}${Capitalize<KebabCaseToLowerCamelCase<B>>}`
        : Lowercase<T>;

/**
 * Creates a cached pipeline function.
 *
 * The function will be cached and the result will be reused if the input hash
 * is the same.
 *
 * The function will be executed only once per input hash if the type is set to
 * `'non-deterministic'`, when executed the second time it will throw with
 * {@link CycleDetectedError}.
 *
 * If the type is set to `'deterministic'` the function will be executed once,
 * when executed the second time it would return the cached result.
 *
 * To address cross-cutting concerns and side-effects the behavior of all the
 * pipeline functions can be customized by initializing the pipeline state with
 * {@link createCachedPipeline} function and passing configuration parameters.
 */
export function makeCachedFunction<
    const Key extends string,
    InputSchema extends SupportedZodSchemas,
    OutputSchema extends SupportedZodSchemas,
>(
    opts: {
        name?: Key;
        type?: 'deterministic' | 'non-deterministic';
        enableCache?: boolean;
        inputSchema: InputSchema;
        resultSchema: OutputSchema;
        transform: (
            input: z.output<InputSchema> & {
                attempt?: number;
            },
            ctx: CacheStateRef & {
                dispatch: (typeof defaultDeps)['dispatch'];
                actions: (typeof defaultDeps)['actions'];
                skipSavingToCache: (err: unknown) => void;
            }
        ) => Promise<TypeOf<OutputSchema>>;
    },
    deps = defaultDeps
): {
    inputSchema: InputSchema;
    resultSchema: OutputSchema;
    completedEvent: ActionCreatorWithSchema<
        `${KebabCaseToLowerCamelCase<Key>}Completed`,
        OutputSchema
    >;
    (
        input: z.input<InputSchema> & {
            attempt?: number;
        },
        ctx?: CacheStateRef
    ): Promise<TypeOf<OutputSchema>>;
} {
    const fnName = kebabCaseToLowerCamelCase(opts.name ?? opts.transform.name);

    const completedEvent = declareActionWithSchema(
        fnName + 'Completed',
        opts.resultSchema
    ) as ActionCreatorWithSchema<
        `${KebabCaseToLowerCamelCase<Key>}Completed`,
        OutputSchema
    >;

    const cachedObservable = makeCachedObservable(
        {
            ...opts,
            name: opts.name ?? opts.transform.name,
            type: opts.type,
            inputSchema: opts.inputSchema,
            eventSchema: [completedEvent.schema],
            captureStackTrace: false,
            cachedEventsSchema: (item) =>
                z.array(item).refine((items) => {
                    if (
                        !items.find(
                            (item) =>
                                typeof item === 'object' &&
                                item &&
                                'type' in item &&
                                item.type === completedEvent.type
                        )
                    ) {
                        return false;
                    }
                    return true;
                }, 'No result event found'),
            factory: (input, ctx) =>
                defer(async () => {
                    const result = await opts.transform(input, ctx);
                    return completedEvent(result);
                }),
        },
        deps
    );

    /**
     * @note give name to the function to make it easier to debug
     */
    const obj = {
        [fnName]: async (
            ...args: Parameters<typeof cachedObservable>
        ): Promise<TypeOf<OutputSchema>> => {
            const capture = captureStackTrace();
            try {
                const result = await lastValueFrom(
                    cachedObservable(...args).pipe(ofTypes(completedEvent))
                );
                assert('data' in result);
                return result.data as TypeOf<OutputSchema>;
            } catch (err) {
                if (err instanceof Error) {
                    throw capture.prepareForRethrow(err);
                } else {
                    throw err;
                }
            }
        },
    };

    const namedFn = obj[fnName];
    assert(namedFn);

    return Object.assign(namedFn, {
        type: opts.type,
        inputSchema: opts.inputSchema,
        resultSchema: opts.resultSchema,
        completedEvent,
    });
}

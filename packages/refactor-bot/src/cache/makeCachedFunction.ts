import assert from 'assert';
import { defer, lastValueFrom } from 'rxjs';
import type { TypeOf } from 'zod';
import { z } from 'zod';

import { declareActionWithSchema } from '../event-bus';
import { ofTypes } from '../event-bus/operators';
import { captureStackTrace } from '../utils/captureStackTrace';
import { kebabCaseToLowerCamelCase } from '../utils/lowerCamelCaseToKebabCase';
import { defaultDeps } from './dependencies';
import { makeCachedObservable } from './makeCachedObservable';
import type { CacheStateRef, SupportedZodSchemas } from './types';

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
    InputSchema extends SupportedZodSchemas,
    OutputSchema extends SupportedZodSchemas,
>(
    opts: {
        name?: string;
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
            }
        ) => Promise<TypeOf<OutputSchema>>;
    },
    deps = defaultDeps
): {
    name: string;
    inputSchema: InputSchema;
    resultSchema: OutputSchema;
    (
        input: z.input<InputSchema> & {
            attempt?: number;
        },
        ctx?: CacheStateRef
    ): Promise<TypeOf<OutputSchema>>;
} {
    const fnName = kebabCaseToLowerCamelCase(opts.name ?? opts.transform.name);

    const resultEvent = declareActionWithSchema(
        fnName + 'Result',
        opts.resultSchema
    );

    const cachedObservable = makeCachedObservable(
        {
            ...opts,
            name: opts.name ?? opts.transform.name,
            type: opts.type,
            inputSchema: opts.inputSchema,
            eventSchema: [resultEvent.schema],
            captureStackTrace: false,
            cachedEventsSchema: (item) =>
                z.array(item).refine((items) => {
                    if (
                        !items.find(
                            (item) =>
                                typeof item === 'object' &&
                                item &&
                                'type' in item &&
                                item.type === resultEvent.type
                        )
                    ) {
                        return false;
                    }
                    return true;
                }, 'No result event found'),
            factory: (input, ctx) =>
                defer(async () => {
                    const result = await opts.transform(input, ctx);
                    return resultEvent(result);
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
                    cachedObservable(...args).pipe(ofTypes(resultEvent))
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
    });
}

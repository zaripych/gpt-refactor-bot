import assert from 'assert';
import { basename, join, relative } from 'path';
import {
    catchError,
    concat,
    defer,
    from,
    ignoreElements,
    map,
    mergeAll,
    Observable,
    of,
    throwError,
} from 'rxjs';
import type { TypeOf } from 'zod';
import { z } from 'zod';

import { type AnyAction, isOfType } from '../event-bus';
import { line } from '../text/line';
import { captureStackTrace } from '../utils/captureStackTrace';
import {
    kebabCaseToLowerCamelCase,
    lowerCamelCaseToKebabCase,
} from '../utils/lowerCamelCaseToKebabCase';
import { verifyIsNotAborted } from './abort';
import {
    executionFailed,
    executionStarted,
    executionSuccess,
    executionTiming,
} from './actions/executionStatus';
import { lookupEventsInCache, saveEventsToCache } from './cache';
import { defaultDeps } from './dependencies';
import { determineKey } from './determineKey';
import { addToExecutionLog, verifyExecutedOnce } from './log';
import { getPipelineStateRef, initializeCacheState } from './state';
import type { CacheStateRef, SupportedZodSchemas } from './types';
import { validateInput } from './validateInput';

const pushToEventBus =
    <T>(deps: { dispatch: (item: T) => void }) =>
    (stream: Observable<T>) =>
        new Observable<T>((subscriber) => {
            stream.subscribe({
                next: (event) => {
                    deps.dispatch(event);
                    subscriber.next(event);
                },
                error: (error) => {
                    subscriber.error(error);
                },
                complete: () => {
                    subscriber.complete();
                },
            });
        });

/**
 * Wraps the Observable created by the `factory` function with a cache.
 *
 * The observable will be run only once per input hash if the type is set
 * to `'non-deterministic'`, when subscribed the second time it will throw with
 * {@link CycleDetectedError}.
 *
 * If the type is set to `'deterministic'` the observable will be executed once,
 * when subscribed the second time it would replay the cached result.
 *
 * To address cross-cutting concerns and side-effects the behavior of all the
 * cached observables can be customized by initializing the cache state with
 * {@link createCachedPipeline} function and passing configuration parameters.
 */
export function makeCachedObservable<
    InputSchema extends SupportedZodSchemas,
    EventSchema extends SupportedZodSchemas,
>(
    opts: {
        name?: string;
        type?: 'deterministic' | 'non-deterministic';
        enableCache?: boolean;
        inputSchema: InputSchema;
        eventSchema: EventSchema | Array<EventSchema>;
        captureStackTrace?: boolean;
        cachedEventsSchema?: (
            eventSchema: z.ZodType<unknown>
        ) =>
            | z.ZodArray<z.ZodType<unknown>, 'many' | 'atleastone'>
            | z.ZodEffects<
                  z.ZodArray<z.ZodType<unknown>, 'many' | 'atleastone'>
              >;
        factory: (
            input: z.output<InputSchema> & {
                attempt?: number;
            },
            ctx: CacheStateRef & {
                dispatch: (action: AnyAction) => void;
            }
        ) => Observable<TypeOf<EventSchema> | AnyAction>;
    },
    deps = defaultDeps
): {
    name: string;
    inputSchema: InputSchema;
    (
        input: z.input<InputSchema> & {
            attempt?: number;
        },
        ctx?: CacheStateRef & {
            dispatch?: (action: AnyAction) => void;
        }
    ): Observable<TypeOf<EventSchema> | AnyAction>;
} {
    type EventTypes = TypeOf<EventSchema>;

    const fnName = kebabCaseToLowerCamelCase(opts.name ?? opts.factory.name);
    const name = lowerCamelCaseToKebabCase(fnName);
    const shouldEnableCache = opts.enableCache ?? true;
    const eventSchema = Array.isArray(opts.eventSchema)
        ? z.union([
              z.discriminatedUnion(
                  'type',
                  opts.eventSchema as unknown as [
                      z.ZodDiscriminatedUnionOption<'type'>,
                      ...z.ZodDiscriminatedUnionOption<'type'>[],
                  ]
              ),
              z.object({
                  type: z.string(),
                  data: z.unknown(),
              }),
          ])
        : z.union([
              opts.eventSchema,
              z.object({
                  type: z.string(),
                  data: z.unknown(),
              }),
          ]);
    const eventsSchema = opts.cachedEventsSchema
        ? opts.cachedEventsSchema(eventSchema)
        : z.array(eventSchema);

    const withCache = (
        input: z.input<InputSchema>,
        ctxParam?: CacheStateRef & {
            dispatch?: (action: AnyAction) => void;
        }
    ): Observable<EventTypes> =>
        defer(async () => {
            const timestamp = performance.now();
            const ctx = ctxParam || getPipelineStateRef() || {};
            const state = initializeCacheState(ctx, deps);
            const dispatch = ctxParam?.dispatch ?? state.deps.dispatch;

            verifyIsNotAborted(state);

            const validatedInput = await validateInput({
                input,
                inputSchema: opts.inputSchema,
                name,
            });

            const location = ctxParam?.location ?? state.location;

            const { key, valueHash } = determineKey({
                validatedInput,
                name,
                state,
                location,
            });

            const { foundEvents, foundLocation } = shouldEnableCache
                ? await lookupEventsInCache({
                      key,
                      name,
                      state,
                      location,
                      eventsSchema,
                  })
                : { foundLocation: undefined, foundEvents: undefined };

            try {
                if (foundEvents) {
                    deps.logger.debug(
                        line`
                            Step "${name}" with the same input hash "${valueHash}" has already been run ...
                        `,
                        {
                            ...(foundLocation && {
                                location: relative(
                                    process.cwd(),
                                    foundLocation
                                ),
                            }),
                        }
                    );

                    verifyExecutedOnce({
                        key,
                        name,
                        state,
                        type: opts.type ?? 'non-deterministic',
                    });

                    addToExecutionLog({
                        state,
                        key,
                    });

                    return from(foundEvents).pipe(
                        map((action) => {
                            if (isOfType(action, executionSuccess)) {
                                return executionSuccess({
                                    ...action.data,
                                    cached: true,
                                });
                            }
                            return action;
                        }),
                        pushToEventBus({
                            dispatch,
                        })
                    );
                }

                const events: AnyAction[] = [];

                const recordAndDispatch = (action: AnyAction) => {
                    events.push(action);
                    dispatch(action);
                };

                deps.logger.debug(
                    line`
                        Starting step "${name}" with input hash "${valueHash}" ... 
                    `,
                    {
                        ...(location && {
                            location: relative(process.cwd(), location),
                        }),
                    }
                );

                verifyExecutedOnce({
                    key,
                    name,
                    state,
                    type: opts.type ?? 'non-deterministic',
                });

                addToExecutionLog({
                    state,
                    key,
                });

                const resultingEvents = concat(
                    of(
                        executionStarted({
                            name,
                            key,
                            input,
                        })
                    ),
                    opts.factory(validatedInput, {
                        ...ctx,
                        ...(location && {
                            location: join(location, basename(key)),
                        }),
                        dispatch: recordAndDispatch,
                    }) as Observable<AnyAction>,
                    of(
                        executionSuccess({
                            name,
                            key,
                            cached: false,
                        })
                    ),
                    defer(() =>
                        of(
                            executionTiming({
                                name,
                                key,
                                timestamp,
                                duration: performance.now() - timestamp,
                            })
                        )
                    )
                ).pipe(
                    pushToEventBus({
                        dispatch: recordAndDispatch,
                    })
                );

                const saveResultingEvents = defer(async () => {
                    await saveEventsToCache({
                        events,
                        eventsSchema,
                        key,
                        state,
                        location,
                    });
                }).pipe(ignoreElements());

                return concat(resultingEvents, saveResultingEvents).pipe(
                    catchError((error: unknown) => {
                        dispatch(
                            executionFailed({
                                name,
                                key,
                                error,
                            })
                        );
                        return throwError(() => error);
                    })
                );
            } catch (error) {
                dispatch(
                    executionFailed({
                        name,
                        key,
                        error,
                    })
                );
                throw error;
            }
        }).pipe(mergeAll());

    /**
     * @note give name to the function to make it easier to debug
     */
    const obj = {
        [fnName]: (
            ...args: Parameters<typeof withCache>
        ): ReturnType<typeof withCache> => {
            const captured = captureStackTrace({
                enabled: opts.captureStackTrace ?? true,
            });
            try {
                return withCache(...args).pipe(
                    catchError((error: unknown) => {
                        if (error instanceof Error) {
                            throw captured.prepareForRethrow(error);
                        } else {
                            throw error;
                        }
                    })
                );
            } catch (error) {
                if (error instanceof Error) {
                    throw captured.prepareForRethrow(error);
                } else {
                    throw error;
                }
            }
        },
    };

    const namedFn = obj[fnName];
    assert(namedFn);

    return Object.assign(namedFn, {
        type: opts.type,
        inputSchema: opts.inputSchema,
    });
}

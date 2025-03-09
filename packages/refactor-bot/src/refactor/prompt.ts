import hash from 'object-hash';
import type { Observable } from 'rxjs';
import { concat, defer, EMPTY, from, lastValueFrom, of } from 'rxjs';
import {
    catchError,
    expand,
    map,
    mergeAll,
    mergeMap,
    switchMap,
    toArray,
} from 'rxjs/operators';
import type { TypeOf } from 'zod';
import { z } from 'zod';

import { makeCachedFunction } from '../cache/makeCachedFunction';
import type { CacheStateRef } from '../cache/types';
import type { Message, RegularAssistantMessage } from '../chat-gpt/api';
import { messageSchema, regularAssistantMessageSchema } from '../chat-gpt/api';
import { OutOfContextBoundsError } from '../errors/outOfContextBoundsError';
import { functionsRepositorySchema } from '../functions/prepareFunctionsRepository';
import { allowedFunctionsSchema } from '../functions/registry';
import { llmDependenciesSchema } from '../llm/llmDependencies';
import { logger } from '../logger/logger';
import { line } from '../text/line';
import { ensureHasOneElement } from '../utils/hasOne';
import { isTruthy } from '../utils/isTruthy';

export const promptInputSchema = z.object({
    preface: z.string().optional(),
    prompt: z.string().optional(),
    messages: z.array(messageSchema).optional(),

    temperature: z.number(),

    choices: z.number().optional(),
    dedupe: z.boolean().optional(),

    seed: z.string().optional(),

    /**
     * Number of times we allow the `shouldStop` function to throw an exception
     * before we re-throw it and fail the whole prompt execution
     */
    maxExceptions: z.number().default(3),

    /**
     * Number of times we allow the `shouldStop` function to continue the prompt
     * before we stop it and fail the whole prompt execution
     */
    maxBounceBacks: z.number().default(3),

    allowedFunctions: allowedFunctionsSchema,

    shouldStop: z.lazy(() => z.custom<ShouldStopCallback>().optional()),

    abortSignal: z.custom<() => AbortSignal>().optional(),

    llmDependencies: llmDependenciesSchema,
    functionsRepository: functionsRepositorySchema,
});

const statuses = [
    'initial-state',
    'function-execution-result',
    'should-not-stop',
    'invalid-function-name',
    // finish reasons
    'length',
    'stop',
    'tool_calls',
    'function_call',
] as const;

type ConversationChainState = {
    status:
        | (typeof statuses)[number]
        | (string & { _brand: 'unknown-conversation-state-status' });
    messages: Message[];
    exceptions: number;
    bounceBacks: number;
    metadata?: {
        middleware?: string;
    } & Record<string, unknown>;
} & Record<string, unknown>;

export const promptResultSchema = z.object({
    key: z.string().optional(),
    choices: z
        .array(
            z.object({
                resultingMessage: regularAssistantMessageSchema,
                state: z.custom<() => ConversationChainState>(),
            })
        )
        .nonempty(),
});

type MiddlewareParams = {
    state: ConversationChainState;
    opts: Omit<z.output<typeof promptInputSchema>, 'middlewares'>;
    ctx: CacheStateRef;
};

type ShouldStopParams = {
    state: ConversationChainState;
    message: RegularAssistantMessage;
    ctx: CacheStateRef;
};

export type PromptChainMiddleware = (
    params: MiddlewareParams
) => Observable<ConversationChainState>;

export type ShouldStopCallback = (
    params: ShouldStopParams
) => true | string | Promise<true | string>;

function removeFunctionFromState(
    opts: {
        messages: Array<Message>;
        name: string;
    } & Pick<TypeOf<typeof promptInputSchema>, 'functionsRepository'>
) {
    // remove bad function name from messages because the ChatGPT
    // API itself chokes on it and stops processing the chain
    const badFunctionIndex = opts.messages.findIndex(
        (fn) =>
            fn.role === 'assistant' &&
            'functionCall' in fn &&
            fn.functionCall.name === opts.name
    );

    if (badFunctionIndex >= 0) {
        opts.messages.splice(badFunctionIndex, 1);
    }

    opts.messages.push({
        role: 'system',
        content:
            `Function "${opts.name}" is not a valid ` +
            `function name. Valid function names are: ` +
            `${opts.functionsRepository().config.allowedFunctions.join(', ')}`,
    });
}

const initialState = (opts: z.infer<typeof promptInputSchema>) => {
    if (opts.prompt && opts.messages) {
        throw new Error(
            line`
                Invalid prompt, you cannot provide both a "prompt" and "messages"
            `
        );
    }
    const messages: Message[] = opts.messages
        ? opts.messages
        : [
              opts.preface && {
                  content: opts.preface,
                  role: 'system' as const,
              },
              {
                  content: z.string().parse(opts.prompt),
                  role: 'user' as const,
              },
          ].filter(isTruthy);

    return {
        status: 'initial-state' as const,
        messages,
        exceptions: 0,
        bounceBacks: 0,
    };
};

const lastMessageFrom = (state: ConversationChainState) => {
    const lastMessage = state.messages[state.messages.length - 1];
    if (!lastMessage) {
        throw new Error('Invalid state, no last message found');
    }
    return lastMessage;
};

const lastAssistantMessageFrom = (state: ConversationChainState) => {
    const lastMessage = state.messages[state.messages.length - 1];
    if (!lastMessage) {
        throw new Error('Invalid state, no last message found');
    }
    return regularAssistantMessageSchema.parse(lastMessage, {
        errorMap: () => ({
            message: line`
                Invalid algorithm, the last message in conversation doesn't conform to the expected schema
            `,
        }),
    });
};

const createDefaultMiddlewares = (
    opts: z.output<typeof promptInputSchema>,
    ctx?: CacheStateRef
) => {
    const repository = opts
        .functionsRepository()
        .setAllowedFunctions(opts.allowedFunctions);

    const functionsRepository = () => repository;

    const throwsIfMaxExceptionsOrBounceBacksReached: PromptChainMiddleware = ({
        state,
    }) => {
        if (state.bounceBacks > opts.maxBounceBacks) {
            throw new Error(
                line`
                    ${opts.maxBounceBacks} bounce backs reached - the
                    LLM cannot satisfy validation conditions for the
                    prompt
                `
            );
        }

        if (state.exceptions > opts.maxExceptions) {
            throw new Error(
                line`
                    ${opts.maxExceptions} exceptions reached - the
                    LLM cannot satisfy validation conditions for the
                    prompt
                `
            );
        }

        return EMPTY;
    };

    const sendsUserSystemAndFunctionResultMessagesToLLM: PromptChainMiddleware =
        ({ state, opts }) => {
            const lastMessage = lastMessageFrom(state);

            if (
                lastMessage.role !== 'system' &&
                lastMessage.role !== 'function' &&
                lastMessage.role !== 'tool' &&
                lastMessage.role !== 'user'
            ) {
                return EMPTY;
            }

            return defer(async () => {
                const result = await opts.llmDependencies().chat(
                    {
                        ...state,
                        temperature: opts.temperature,
                        choices: opts.choices,
                        functionsRepository,
                        abortSignal: opts.abortSignal,
                    },
                    ctx
                );

                const shouldDedupe = opts.dedupe ?? false;

                const unique = new Map(
                    result.response.choices.map(
                        (choice) => [hash(choice.message), choice] as const
                    )
                );

                const nextStateChoices = shouldDedupe
                    ? [...unique.values()].map((choice) => ({
                          status: choice.finishReason,
                          messages: [...state.messages, choice.message],
                      }))
                    : result.response.choices.map((choice) => ({
                          status: choice.finishReason,
                          messages: [...state.messages, choice.message],
                      }));

                if (
                    nextStateChoices.length === 1 &&
                    nextStateChoices[0]?.status === 'length'
                ) {
                    throw new OutOfContextBoundsError(
                        line`
                            We have hit the maximum length of the context, please try again
                            with a shorter prompt or upgrade to a more expensive model
                        `
                    );
                }

                return nextStateChoices.map((choice) => ({
                    ...choice,
                    exceptions: state.exceptions,
                    bounceBacks: state.bounceBacks,
                }));
            }).pipe(mergeAll());
        };

    const makesLegacyFunctionCallsToRespondToLLM: PromptChainMiddleware = ({
        state,
    }) => {
        const lastMessage = lastMessageFrom(state);

        if (!('functionCall' in lastMessage)) {
            return EMPTY;
        }

        const functionCall = lastMessage.functionCall;

        return defer(async () => {
            if (
                !repository.config.allowedFunctions.find(
                    (fn) => fn === functionCall.name
                )
            ) {
                removeFunctionFromState({
                    functionsRepository,
                    messages: state.messages,
                    name: functionCall.name,
                });

                return {
                    ...state,
                    status: 'invalid-function-name' as const,
                    messages: state.messages,
                };
            }

            const result = await functionsRepository().executeGptFunction(
                {
                    functionCall: lastMessage.functionCall,
                },
                ctx
            );

            return {
                ...state,
                status: 'function-execution-result' as const,
                messages: [...state.messages, result.message],
            };
        });
    };

    const makesToolsCallsToRespondToLLM: PromptChainMiddleware = ({
        state,
    }) => {
        const lastMessage = lastMessageFrom(state);

        if (!('toolCalls' in lastMessage)) {
            return EMPTY;
        }

        const toolCalls = lastMessage.toolCalls;

        return from(toolCalls).pipe(
            mergeMap(async (toolCall) => {
                const result = await functionsRepository().executeGptToolCall(
                    {
                        toolCall,
                    },
                    ctx
                );

                if (result.suggestionMessage) {
                    return [result.message, result.suggestionMessage];
                }

                return [result.message];
            }),
            mergeAll(),
            toArray(),
            map((messages) => ({
                ...state,
                status: 'function-execution-result' as const,
                messages: [
                    ...state.messages,
                    ...messages.sort((a, b) => {
                        if (a.role === 'tool') {
                            return -1;
                        }
                        if (b.role === 'tool') {
                            return 1;
                        }
                        return 0;
                    }),
                ],
            }))
        );
    };

    const validatesFinalMessagesUsingShouldStopCallback: PromptChainMiddleware =
        ({ state, ctx, opts }) => {
            const shouldStop = opts.shouldStop;
            if (!shouldStop) {
                return EMPTY;
            }

            const lastMessageCandidate = lastMessageFrom(state);
            if (lastMessageCandidate.role !== 'assistant') {
                return EMPTY;
            }
            if ('functionCall' in lastMessageCandidate) {
                return EMPTY;
            }
            if ('toolCalls' in lastMessageCandidate) {
                return EMPTY;
            }

            const lastMessage = lastAssistantMessageFrom(state);

            return defer(async () => {
                const [result] = await Promise.allSettled([
                    new Promise<true | string>((resolve) => {
                        resolve(
                            shouldStop({
                                state,
                                message: lastMessage,
                                ctx,
                            })
                        );
                    }),
                ]);

                if (result.status === 'fulfilled' && result.value === true) {
                    return [];
                }

                const exceptions = result.status === 'rejected' ? 1 : 0;

                if (result.status === 'rejected') {
                    logger.trace(
                        'Model has returned an incompatible response',
                        {
                            error: result.reason as unknown,
                        }
                    );
                }

                const content =
                    result.status === 'rejected'
                        ? result.reason instanceof Error
                            ? result.reason.message
                            : String(result.reason)
                        : (result.value as string);

                return [
                    {
                        status: 'should-not-stop' as const,
                        messages: [
                            ...state.messages,
                            {
                                role: 'system' as const,
                                content,
                            },
                        ],
                        exceptions: state.exceptions + exceptions,
                        bounceBacks: state.bounceBacks + 1,
                    },
                ];
            }).pipe(mergeAll());
        };

    const defaultMiddlewares = [
        throwsIfMaxExceptionsOrBounceBacksReached,
        sendsUserSystemAndFunctionResultMessagesToLLM,
        makesLegacyFunctionCallsToRespondToLLM,
        makesToolsCallsToRespondToLLM,
        validatesFinalMessagesUsingShouldStopCallback,
    ];

    return {
        throwsIfMaxExceptionsOrBounceBacksReached,
        sendsUserSystemAndFunctionResultMessagesToLLM,
        makesLegacyFunctionCallsToRespondToLLM,
        validatesFinalMessagesUsingShouldStopCallback,
        defaultMiddlewares,
    };
};

export const prompt = makeCachedFunction({
    name: 'prompt',
    inputSchema: promptInputSchema.augment({
        middlewares: z
            .custom<
                (
                    params: ReturnType<typeof createDefaultMiddlewares>
                ) => Array<PromptChainMiddleware>
            >()
            .optional(),
    }),
    resultSchema: promptResultSchema,
    transform: async (opts, ctx) => {
        const middlewares = createDefaultMiddlewares(opts, ctx);

        const customizedMiddlewares = opts.middlewares
            ? opts.middlewares(middlewares)
            : middlewares.defaultMiddlewares;

        const stream = from([initialState(opts)]).pipe(
            expand((state) => {
                return concat(
                    ...customizedMiddlewares.map((middleware) =>
                        middleware({ state, opts, ctx }).pipe(
                            map((nextState) => {
                                return {
                                    ...nextState,
                                    metadata: {
                                        middleware: middleware.name,
                                    },
                                };
                            })
                        )
                    )
                );
            }),
            mergeMap((state) => {
                // everything that gets into expand and what gets out of it
                // will be result of the expand operator, so we must
                // filter out only the "stop" status state that are not failed
                if (state.status !== 'stop') {
                    return EMPTY;
                }

                const shouldStop = opts.shouldStop;
                if (shouldStop) {
                    // we also need to filter out the stop messages that are
                    // failed when shouldStop was called with their content
                    return defer(async () => {
                        const lastMessage = lastAssistantMessageFrom(state);

                        const shouldUseStopMessage = await shouldStop({
                            state,
                            message: lastMessage,
                            ctx,
                        });

                        return shouldUseStopMessage === true;
                    }).pipe(
                        catchError(() => of(false)),
                        switchMap((shouldUseStopMessage) =>
                            shouldUseStopMessage ? of(state) : EMPTY
                        )
                    );
                }

                return of(state);
            }),
            map((state) => ({
                resultingMessage: lastAssistantMessageFrom(state),
                state: () => state,
            })),
            toArray()
        );

        const choices = ensureHasOneElement(await lastValueFrom(stream));

        return {
            key: ctx.location,
            choices,
        };
    },
});

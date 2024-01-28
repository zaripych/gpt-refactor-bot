import hash from 'object-hash';
import type { Observable } from 'rxjs';
import { defer, EMPTY, from, lastValueFrom, of } from 'rxjs';
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
import type { Message } from '../chat-gpt/api';
import {
    calculatePrice,
    chatCompletions,
    functionResultMessageSchema,
    messageSchema,
    modelsSchema,
    regularAssistantMessageSchema,
    responseSchema,
    systemMessageSchema,
} from '../chat-gpt/api';
import { GptRequestError } from '../errors/gptRequestError';
import { OutOfContextBoundsError } from '../errors/outOfContextBoundsError';
import { executeFunction } from '../functions/executeFunction';
import { includeFunctions } from '../functions/includeFunctions';
import { sanitizeFunctionResult } from '../functions/sanitizeFunctionResult';
import { functionsConfigSchema } from '../functions/types';
import { line } from '../text/line';
import { ensureHasOneElement } from '../utils/hasOne';
import { isTruthy } from '../utils/isTruthy';
import { gptRequestFailed } from './actions/gptRequestFailed';
import { gptRequestSuccess } from './actions/gptRequestSuccess';
import {
    determineModelParameters,
    refactorConfigModelParamsSchema,
} from './determineModelParameters';
import { refactorConfigSchema } from './types';

export const promptInputSchema = z.object({
    preface: z.string().optional(),
    prompt: z.string(),
    temperature: z.number(),
    budgetCents: z.number(),
    functionsConfig: functionsConfigSchema,
    shouldStop: z
        .function()
        .args(regularAssistantMessageSchema)
        .returns(
            z.union([
                z.promise(z.union([z.literal(true), z.string()])),
                z.union([z.literal(true), z.string()]),
            ])
        )
        .optional(),
    model: modelsSchema.optional().default('gpt-3.5-turbo'),
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
});

export const promptResultSchema = z.object({
    key: z.string().optional(),
    choices: z
        .array(
            z.object({
                resultingMessage: regularAssistantMessageSchema,
            })
        )
        .nonempty(),
});

let totalSpend = 0;

const chat = makeCachedFunction({
    name: 'chat',
    inputSchema: promptInputSchema
        .pick({
            model: true,
            temperature: true,
            budgetCents: true,
        })
        .augment({
            allowedFunctions: z.array(z.string()),
            messages: z.array(messageSchema),
            choices: z.number().optional(),
        }),
    resultSchema: z.object({
        response: responseSchema,
    }),
    transform: async (state, ctx) => {
        try {
            const response = await chatCompletions({
                ...state,
                functions: await includeFunctions(state.allowedFunctions),
            });

            ctx.dispatch(
                gptRequestSuccess({
                    model: state.model,
                    key: ctx.location,
                    response,
                })
            );

            const spent = calculatePrice({
                ...response,
                model: state.model,
            });

            totalSpend += spent.totalPrice;

            if (totalSpend * 100 > state.budgetCents) {
                throw new GptRequestError('Spent too much');
            }

            return {
                response,
            };
        } catch (err) {
            ctx.dispatch(
                gptRequestFailed({
                    model: state.model,
                    key: ctx.location,
                    error:
                        err instanceof GptRequestError
                            ? err
                            : new GptRequestError('Unhandled internal error', {
                                  cause: err,
                              }),
                })
            );
            throw err;
        }
    },
});

const exec = makeCachedFunction({
    name: 'exec',
    type: 'deterministic',
    inputSchema: promptInputSchema
        .pick({
            functionsConfig: true,
        })
        .extend({
            functionCall: z.object({
                name: z.string(),
                arguments: z.string(),
            }),
        }),
    resultSchema: z.object({
        message: z.union([systemMessageSchema, functionResultMessageSchema]),
    }),
    transform: async ({ functionCall, functionsConfig }) => {
        let parsedArgs: unknown;
        try {
            parsedArgs = JSON.parse(functionCall.arguments);
        } catch {
            return {
                message: {
                    role: 'system' as const,
                    content: `Cannot parse function arguments as JSON`,
                },
            };
        }

        try {
            const result = await executeFunction(
                {
                    name: functionCall.name,
                    arguments: parsedArgs as never,
                },
                functionsConfig
            );

            return {
                message: {
                    role: 'function' as const,
                    name: functionCall.name,
                    content: JSON.stringify(result),
                },
            };
        } catch (e) {
            return {
                message: {
                    role: 'system' as const,
                    content: await sanitizeFunctionResult({
                        result: e instanceof Error ? e.message : String(e),
                        config: functionsConfig,
                    }),
                },
            };
        }
    },
});

function removeFunctionFromState(
    opts: {
        messages: Array<Message>;
        name: string;
    } & Pick<TypeOf<typeof promptInputSchema>, 'functionsConfig'>
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
            `${opts.functionsConfig.allowedFunctions.join(', ')}`,
    });
}

export type RefactorConfigPromptOpts = z.input<
    typeof refactorConfigPromptOptsSchema
>;

export const refactorConfigPromptOptsSchema = refactorConfigSchema
    .pick({
        budgetCents: true,
        scope: true,
        tsConfigJsonFileName: true,
        allowedFunctions: true,
    })
    .merge(refactorConfigModelParamsSchema)
    .augment({
        sandboxDirectoryPath: z.string(),
    });

export const promptParametersFrom = (
    inputRaw: RefactorConfigPromptOpts,
    ctx?: CacheStateRef
): Omit<z.input<typeof promptInputSchema>, 'temperature' | 'prompt'> => {
    const input = refactorConfigPromptOptsSchema.parse(inputRaw);
    return {
        budgetCents: input.budgetCents,
        functionsConfig: {
            repositoryRoot: input.sandboxDirectoryPath,
            scope: input.scope,
            tsConfigJsonFileName: input.tsConfigJsonFileName,
            allowedFunctions: input.allowedFunctions,
        },
        ...determineModelParameters(input, ctx),
    };
};

export const prompt = makeCachedFunction({
    name: 'prompt',
    inputSchema: promptInputSchema,
    resultSchema: promptResultSchema,
    transform: async (opts, ctx) => {
        const initialState = () => {
            const messages: Message[] = [
                opts.preface && {
                    content: opts.preface,
                    role: 'system' as const,
                },
                {
                    content: opts.prompt,
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

        const stream = from([initialState()]).pipe(
            expand((state) => {
                const lastMessage = state.messages[state.messages.length - 1];
                if (!lastMessage) {
                    throw new Error('Invalid state, no last message found');
                }

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

                if (
                    lastMessage.role === 'system' ||
                    lastMessage.role === 'function' ||
                    lastMessage.role === 'user'
                ) {
                    return defer(async () => {
                        const result = await chat(
                            {
                                ...state,
                                budgetCents: opts.budgetCents,
                                allowedFunctions:
                                    opts.functionsConfig.allowedFunctions,
                                model: opts.model,
                                temperature: opts.temperature,
                                choices: opts.choices,
                            },
                            ctx
                        );

                        const shouldDedupe = opts.dedupe ?? false;

                        const unique = new Map(
                            result.response.choices.map(
                                (choice) =>
                                    [hash(choice.message), choice] as const
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
                                `We have hit the maximum length of the context, please try again with a shorter prompt or upgrade to a more expensive model`
                            );
                        }

                        return nextStateChoices.map((choice) => ({
                            ...choice,
                            exceptions: state.exceptions,
                            bounceBacks: state.bounceBacks,
                        }));
                    }).pipe(mergeAll());
                } else if ('functionCall' in lastMessage) {
                    const functionCall = lastMessage.functionCall;
                    return defer(async () => {
                        if (
                            !opts.functionsConfig.allowedFunctions.find(
                                (fn) => fn === functionCall.name
                            )
                        ) {
                            removeFunctionFromState({
                                messages: state.messages,
                                functionsConfig: opts.functionsConfig,
                                name: functionCall.name,
                            });

                            return {
                                status: 'invalid-function-name' as const,
                                messages: state.messages,
                            };
                        }

                        const result = await exec(
                            {
                                functionCall: lastMessage.functionCall,
                                functionsConfig: opts.functionsConfig,
                            },
                            ctx
                        );

                        return {
                            status: 'function-execution-result' as const,
                            messages: [...state.messages, result.message],
                        };
                    });
                } else {
                    if (opts.shouldStop) {
                        const shouldStop = opts.shouldStop;
                        const lastMessage = regularAssistantMessageSchema.parse(
                            state.messages[state.messages.length - 1],
                            {
                                errorMap: () => ({
                                    message: `Invalid algorithm, the last message in conversation doesn't conform to the expected schema`,
                                }),
                            }
                        );

                        return defer(async () => {
                            const [result] = await Promise.allSettled([
                                new Promise((resolve) => {
                                    resolve(shouldStop(lastMessage));
                                }),
                            ]);

                            if (
                                result.status === 'fulfilled' &&
                                result.value === true
                            ) {
                                return [];
                            }

                            const exceptions =
                                result.status === 'rejected' ? 1 : 0;

                            const content =
                                result.status === 'rejected'
                                    ? result.reason instanceof Error
                                        ? result.reason.message
                                        : String(result.reason)
                                    : result.value;

                            return [
                                {
                                    status: 'should-not-stop' as const,
                                    messages: [
                                        ...state.messages,
                                        {
                                            role: 'system',
                                            content,
                                        },
                                    ],
                                    exceptions: state.exceptions + exceptions,
                                    bounceBacks: state.bounceBacks + 1,
                                },
                            ];
                        }).pipe(mergeAll());
                    }
                    /**
                     * @note stop expanding but also fix the types so that
                     * TypeScript aware that "initial-state" will get out
                     * of this branch and needs filtering out
                     */
                    return EMPTY as Observable<typeof state>;
                }
            }),
            mergeMap((state) => {
                // everything that gets into expand and what gets out of it
                // will be result of the expand operator, so we must
                // filter out only the stop messages that are not failed
                if (state.status !== 'stop') {
                    return EMPTY;
                }

                const shouldStop = opts.shouldStop;
                if (shouldStop) {
                    // we also need to filter out the stop messages that are
                    // failed when shouldStop was called with their content
                    return defer(async () => {
                        const lastMessage = regularAssistantMessageSchema.parse(
                            state.messages[state.messages.length - 1],
                            {
                                errorMap: () => ({
                                    message: `Invalid algorithm, the last message in conversation doesn't conform to the expected schema`,
                                }),
                            }
                        );

                        const shouldUseStopMessage =
                            await shouldStop(lastMessage);

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
            map((state) => {
                return {
                    resultingMessage: regularAssistantMessageSchema.parse(
                        state.messages[state.messages.length - 1],
                        {
                            errorMap: () => ({
                                message: `Invalid algorithm, the last message in conversation doesn't conform to the expected schema`,
                            }),
                        }
                    ),
                };
            }),
            toArray()
        );

        const choices = ensureHasOneElement(await lastValueFrom(stream));

        return {
            key: ctx.location,
            choices,
        };
    },
});

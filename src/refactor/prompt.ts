import hash from 'object-hash';
import type { Observable } from 'rxjs';
import { defer, EMPTY, from, lastValueFrom } from 'rxjs';
import { expand, mergeAll, mergeMap, toArray } from 'rxjs/operators';
import type { TypeOf } from 'zod';
import { z } from 'zod';

import type { Message } from '../chat-gpt/api';
import {
    calculatePriceCents,
    chatCompletions,
    functionResultMessageSchema,
    messageSchema,
    modelsSchema,
    regularAssistantMessageSchema,
    responseSchema,
    systemMessageSchema,
} from '../chat-gpt/api';
import { OutOfContextBoundsError } from '../errors/outOfContextBoundsError';
import { executeFunction } from '../functions/executeFunction';
import { includeFunctions } from '../functions/includeFunctions';
import { functionsConfigSchema } from '../functions/types';
import { makePipelineFunction } from '../pipeline/makePipelineFunction';
import { ensureHasOneElement } from '../utils/hasOne';
import { isTruthy } from '../utils/isTruthy';

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
});

export const promptResultSchema = z.object({
    choices: z
        .array(
            z.object({
                resultingMessage: regularAssistantMessageSchema,
            })
        )
        .nonempty(),
});

let totalSpend = 0;

const chat = makePipelineFunction({
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
    transform: async (state) => {
        const response = await chatCompletions({
            ...state,
            functions: await includeFunctions(state.allowedFunctions),
        });

        const spentCents = calculatePriceCents({
            ...response,
            model: state.model,
        });

        totalSpend += spentCents;

        if (totalSpend > state.budgetCents) {
            throw new Error('Spent too much');
        }

        return {
            response,
        };
    },
}).withPersistence();

const exec = makePipelineFunction({
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
        let parsedArgs: unknown | undefined;
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
                    content: e instanceof Error ? e.message : String(e),
                },
            };
        }
    },
}).withPersistence();

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

export const prompt = makePipelineFunction({
    name: 'prompt',
    inputSchema: promptInputSchema,
    resultSchema: promptResultSchema,
    transform: async (opts, persistence) => {
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
            };
        };

        const stream = from([initialState()]).pipe(
            expand((state, i) => {
                const lastMessage = state.messages[state.messages.length - 1];
                if (!lastMessage) {
                    throw new Error('Invalid state, no last message found');
                }

                if (
                    lastMessage.role === 'system' ||
                    lastMessage.role === 'function' ||
                    lastMessage.role === 'user'
                ) {
                    return defer(async () => {
                        const result = await chat.transform(
                            {
                                ...state,
                                budgetCents: opts.budgetCents,
                                allowedFunctions:
                                    opts.functionsConfig.allowedFunctions,
                                model: opts.model,
                                temperature: opts.temperature,
                                /**
                                 * @note if this is the first prompt, we
                                 * ask for multiple choices answer to start
                                 * multiple branches of conversation
                                 */
                                ...(i === 0 && {
                                    choices: opts.choices,
                                }),
                            },
                            persistence
                        );

                        const unique = new Map(
                            result.response.choices.map(
                                (choice) =>
                                    [hash(choice.message), choice] as const
                            )
                        );

                        const nextStateChoices = [...unique.values()].map(
                            (choice) => ({
                                status: choice.finishReason,
                                messages: [...state.messages, choice.message],
                            })
                        );

                        if (
                            nextStateChoices.length === 1 &&
                            nextStateChoices[0]?.status === 'length'
                        ) {
                            throw new OutOfContextBoundsError(
                                `We have hit the maximum length of the context, please try again with a shorter prompt or upgrade to a more expensive model`
                            );
                        }

                        return nextStateChoices;
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

                        const result = await exec.transform(
                            {
                                functionCall: lastMessage.functionCall,
                                functionsConfig: opts.functionsConfig,
                            },
                            persistence
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
                            const result = await Promise.resolve(
                                shouldStop(lastMessage)
                            ).catch((e) =>
                                e instanceof Error ? e.message : String(e)
                            );

                            if (result === true) {
                                return [];
                            }

                            return [
                                {
                                    status: 'should-not-stop' as const,
                                    messages: [
                                        ...state.messages,
                                        {
                                            role: 'system',
                                            content: result,
                                        },
                                    ],
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
                // everything that gets into expand gets out of it, so we must
                // filter out the initial state
                if (state.status !== 'stop') {
                    return EMPTY;
                }

                return [
                    {
                        resultingMessage: regularAssistantMessageSchema.parse(
                            state.messages[state.messages.length - 1],
                            {
                                errorMap: () => ({
                                    message: `Invalid algorithm, the last message in conversation doesn't conform to the expected schema`,
                                }),
                            }
                        ),
                    },
                ];
            }),
            toArray()
        );

        const choices = ensureHasOneElement(await lastValueFrom(stream));

        return {
            choices,
        };
    },
});

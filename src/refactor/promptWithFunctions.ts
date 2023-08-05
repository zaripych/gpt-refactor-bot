import { z } from 'zod';

import type { FunctionResultMessage, Message } from '../chat-gpt/api';
import {
    calculatePriceCents,
    chatCompletions,
    functionDefinitionSchema,
    messageSchema,
    modelsSchema,
    responseSchema,
} from '../chat-gpt/api';
import { makeDependencies } from '../functions/dependencies';
import { executeFunction } from '../functions/executeFunction';
import { makePipelineFunction } from '../pipeline/makePipelineFunction';
import { pipeline } from '../pipeline/pipeline';
import { isTruthy } from '../utils/isTruthy';

export const promptWithFunctionsInputSchema = z.object({
    preface: z.string().optional(),
    prompt: z.string(),
    temperature: z.number(),
    budgetCents: z.number(),
    functions: z.array(functionDefinitionSchema),
    functionsConfig: z.object({
        repositoryRoot: z.string(),
        dependencies: z
            .function()
            .transform((value) => value as typeof makeDependencies)
            .optional()
            .default(makeDependencies),
    }),
    persistLocation: z.string().optional(),
    shouldStop: z
        .function()
        .transform((value) => value as (messages: Message[]) => true | Message)
        .optional(),
    model: modelsSchema.optional().default('gpt-3.5-turbo'),
});

export const promptWithFunctionsResultSchema = z.object({
    messages: z.array(messageSchema),
    spentCents: z.number(),
});

export const promptWithFunctions = makePipelineFunction({
    name: 'prompt-with-functions',
    inputSchema: promptWithFunctionsInputSchema,
    resultSchema: promptWithFunctionsResultSchema,
    transform: async (opts, persistence) => {
        type InitialState = z.infer<typeof initialStateSchema>;

        const initialStateSchema = z.object({
            messages: z.array(messageSchema),
            spentCents: z.number(),
        });

        const resultSchema = z.object({
            response: responseSchema,
            spentCents: z.number(),
        });

        const pipe = pipeline(initialStateSchema)
            .append({
                name: 'chat-completions',
                transform: async (state) => {
                    const response = await chatCompletions({
                        model: opts.model,
                        messages: state.messages,
                        functions: opts.functions,
                        temperature: opts.temperature,
                    });

                    const spentCents = calculatePriceCents({
                        ...response,
                        model: opts.model,
                    });

                    return {
                        spentCents,
                        response,
                    };
                },
                inputSchema: initialStateSchema.pick({
                    messages: true,
                }),
                resultSchema,
            })
            .combineLast((state, { response, spentCents }) => ({
                messages: [...state.messages, response.choices[0].message],
                response,
                spentCents: state.spentCents + spentCents,
            }));

        const initialState = (): InitialState => {
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
                messages,
                spentCents: 0,
            };
        };

        let state = initialState();

        try {
            while (state.spentCents < opts.budgetCents) {
                const next = await pipe.transform(state, persistence);

                if ('functionCall' in next.response.choices[0].message) {
                    const { functionCall } = next.response.choices[0].message;

                    if (
                        !opts.functions.find(
                            (fn) => fn.name === functionCall.name
                        )
                    ) {
                        next.messages.push({
                            role: 'system',
                            content:
                                `Function "${functionCall.name}" is not a valid ` +
                                `function name. Valid function names are: ` +
                                `${opts.functions
                                    .map((fn) => fn.name)
                                    .join(', ')}`,
                        });
                    } else {
                        let parsedArgs: unknown | undefined;
                        try {
                            parsedArgs = JSON.parse(functionCall.arguments);
                        } catch (e) {
                            next.messages.push({
                                role: 'system',
                                content: `Cannot parse function arguments as JSON`,
                            });
                        }

                        if (parsedArgs) {
                            const result = await executeFunction({
                                ...opts.functionsConfig,
                                strict: true,
                                name: functionCall.name,
                                arguments: parsedArgs as never,
                            })
                                .then(
                                    (executeResult) =>
                                        ({
                                            role: 'function',
                                            name: functionCall.name,
                                            content:
                                                JSON.stringify(executeResult),
                                        } satisfies FunctionResultMessage)
                                )
                                .catch((e) => ({
                                    role: 'function' as const,
                                    name: functionCall.name,
                                    content: JSON.stringify({
                                        status: 'error',
                                        message:
                                            e instanceof Error
                                                ? e.message
                                                : String(e),
                                    }),
                                }));

                            next.messages.push(result);
                        }
                    }
                }

                if (next.response.choices[0].finishReason === 'stop') {
                    const shouldStop = opts.shouldStop ?? (() => true);
                    const shouldStopResult = shouldStop(next.messages);
                    if (shouldStopResult === true) {
                        state = next;
                        break;
                    } else {
                        next.messages.push(shouldStopResult);
                    }
                }

                state = next;
            }
        } finally {
            if (persistence) {
                await pipe.clean(persistence);
            }
        }

        return {
            messages: state.messages,
            spentCents: state.spentCents,
        };
    },
});

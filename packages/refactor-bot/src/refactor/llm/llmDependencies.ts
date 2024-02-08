import { z } from 'zod';

import { makeCachedFunction } from '../../cache/makeCachedFunction';
import {
    calculatePrice,
    chatCompletions,
    messageSchema,
    responseSchema,
} from '../../chat-gpt/api';
import { GptRequestError } from '../../errors/gptRequestError';
import { determineModelParameters } from './determineModelParameters';
import { functionsRepositorySchema, refactorConfigSchema } from '../types';
import { gptRequestFailed } from './actions/gptRequestFailed';
import { gptRequestSuccess } from './actions/gptRequestSuccess';

export type LlmDependencies = Awaited<
    ReturnType<typeof prepareLlmDependencies>
>;

const llmDependenciesConfigSchema = refactorConfigSchema.pick({
    model: true,
    budgetCents: true,
    modelByStepCode: true,
    useMoreExpensiveModelsOnRetry: true,
});

export async function prepareLlmDependencies(
    rawConfig: z.output<typeof llmDependenciesConfigSchema>
) {
    const config = await llmDependenciesConfigSchema.parseAsync(rawConfig);

    let totalSpend = 0;

    const chat = makeCachedFunction({
        name: 'chat',
        inputSchema: z.object({
            messages: z.array(messageSchema),
            temperature: z.number(),
            choices: z.number().optional(),

            functionsRepository: functionsRepositorySchema,
        }),
        resultSchema: z.object({
            response: responseSchema,
        }),
        transform: async (params, ctx) => {
            const modelParameters = determineModelParameters(
                {
                    ...config,
                    ...('attempt' in params && {
                        attempt: params.attempt ?? 0,
                    }),
                },
                ctx
            );
            try {
                const response = await chatCompletions({
                    ...modelParameters,
                    ...params,
                    functions: params.functionsRepository().describeFunctions(),
                });

                const spent = calculatePrice({
                    ...response,
                    model: modelParameters.model,
                });

                totalSpend += spent.totalPrice;

                if (totalSpend * 100 > config.budgetCents) {
                    throw new GptRequestError('Spent too much');
                }

                ctx.dispatch(
                    gptRequestSuccess({
                        model: modelParameters.model,
                        key: ctx.location,
                        response,
                    })
                );

                return {
                    response,
                };
            } catch (err) {
                ctx.dispatch(
                    gptRequestFailed({
                        model: modelParameters.model,
                        key: ctx.location,
                        error:
                            err instanceof GptRequestError
                                ? err
                                : new GptRequestError(
                                      'Unhandled internal error',
                                      {
                                          cause: err,
                                      }
                                  ),
                    })
                );
                throw err;
            }
        },
    });

    return {
        chat,
    };
}

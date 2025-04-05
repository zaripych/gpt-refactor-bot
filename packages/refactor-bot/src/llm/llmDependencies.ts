import { z } from 'zod';

import { makeCachedFunction } from '../cache/makeCachedFunction';
import { messageSchema, responseSchema } from '../chat-gpt/api';
import { GptRequestError } from '../errors/gptRequestError';
import { functionsRepositorySchema } from '../functions/prepareFunctionsRepository';
import { refactorConfigSchema } from '../refactor/types';
import { gptRequestFailed } from './actions/gptRequestFailed';
import { gptRequestStarted } from './actions/gptRequestStarted';
import { gptRequestSuccess } from './actions/gptRequestSuccess';
import { determineModelParameters } from './determineModelParameters';

export type LlmDependencies = Awaited<
    ReturnType<typeof prepareLlmDependencies>
> & {
    readonly _brand?: 'LlmDependencies';
};

const llmDependenciesConfigSchema = refactorConfigSchema.pick({
    model: true,
    modelByStepCode: true,
    useMoreExpensiveModelsOnRetry: true,
});

export async function prepareLlmDependencies(
    rawConfig: z.output<typeof llmDependenciesConfigSchema>
) {
    const config = await llmDependenciesConfigSchema.parseAsync(rawConfig);

    const chat = makeCachedFunction({
        name: 'chat',
        inputSchema: z.object({
            messages: z.array(messageSchema),
            temperature: z.number(),
            choices: z.number().optional(),

            functionsRepository: functionsRepositorySchema,
            abortSignal: z.custom<() => AbortSignal>().optional(),
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
            const { prepareUniversalChatModel } = await import(
                '../chat-gpt/prepareUniversalChatModel'
            );
            const { chatCompletions } = prepareUniversalChatModel();
            try {
                ctx.dispatch(
                    gptRequestStarted({
                        ...modelParameters,
                        ...params,
                        tools: params.functionsRepository().describeFunctions(),
                        key: ctx.location,
                    })
                );

                const response = await chatCompletions({
                    ...modelParameters,
                    ...params,
                    tools: params.functionsRepository().describeFunctions(),
                    abortSignal: params.abortSignal?.(),
                });

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
export const llmDependenciesSchema = z
    .function(z.tuple([]))
    .returns(z.custom<LlmDependencies>());

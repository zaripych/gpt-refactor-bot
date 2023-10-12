import { z } from 'zod';

import { markdown } from '../markdown/markdown';
import { makePipelineFunction } from '../pipeline/makePipelineFunction';
import { format } from '../text/format';
import { determineModelParameters } from './determineModelParameters';
import { prompt } from './prompt';
import { refactorConfigSchema } from './types';

export const enrichObjectiveInputSchema = refactorConfigSchema
    .pick({
        objective: true,
        budgetCents: true,
        model: true,
        modelByStepCode: true,
        useMoreExpensiveModelsOnRetry: true,
        scope: true,
        tsConfigJsonFileName: true,
        allowedFunctions: true,
    })
    .augment({
        sandboxDirectoryPath: z.string(),
    });

export const enrichObjectiveResultSchema = z.object({
    /**
     * Objective with extra information obtained using functions executed
     * against the repository at the time before refactoring started.
     */
    enrichedObjective: z.string(),
});

export type EnrichObjectiveResponse = z.infer<
    typeof enrichObjectiveResultSchema
>;

const systemPrompt = markdown`
    Think step by step. Be concise and to the point. Do not make assumptions
    other than what was given in the instructions.
`;

const enrichPromptText = (originalObjective: string) =>
    format(
        markdown`
            These are the original instructions:

            %originalObjective%

            Given the above instructions that represent an objective, use the
            tool box directly via OpenAI function calling to obtain extra
            information. Feel free to make multiple calls, if needed.

            The extra information is meant to help to determine the steps needed
            to achieve the objective, but doesn't need to describe the steps.
            Extra information should be concise, should not make conclusions or
            provide advice, it should contain just facts that are retrieved from
            results of the function calls. Do not include any information that
            is not relevant to the objective.

            Produce retrieved extra information as a final message.
        `,
        { originalObjective }
    );

export const enrichObjective = makePipelineFunction({
    name: 'enrich-objective',
    inputSchema: enrichObjectiveInputSchema,
    resultSchema: enrichObjectiveResultSchema,
    transform: async (input, persistence): Promise<EnrichObjectiveResponse> => {
        const userPrompt = enrichPromptText(input.objective);

        const { choices } = await prompt(
            {
                preface: systemPrompt,
                prompt: userPrompt,
                temperature: 1,
                budgetCents: input.budgetCents,
                functionsConfig: {
                    repositoryRoot: input.sandboxDirectoryPath,
                    scope: input.scope,
                    tsconfigJsonFileName: input.tsConfigJsonFileName,
                    allowedFunctions: input.allowedFunctions,
                },
                ...determineModelParameters(input, persistence),
            },
            persistence
        );

        return {
            enrichedObjective: [
                input.objective.trim(),
                choices[0].resultingMessage.content.trim(),
            ].join('\n\n'),
        };
    },
});

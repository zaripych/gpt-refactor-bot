import { z } from 'zod';

import { markdown } from '../markdown/markdown';
import { makePipelineFunction } from '../pipeline/makePipelineFunction';
import { isTruthy } from '../utils/isTruthy';
import { makeDependencies } from './dependencies';
import { promptWithFunctions } from './promptWithFunctions';
import { refactorConfigSchema } from './types';

export const planFilesInputSchema = refactorConfigSchema
    .pick({
        budgetCents: true,
    })
    .augment({
        enrichedObjective: z.string(),
        sandboxDirectoryPath: z.string(),
    });

export const planFilesResultSchema = z.object({
    /**
     * List of files that need refactoring to focus on one file at a time.
     */
    plannedFiles: z.array(z.string()),
});

export type PlanFilesResponse = z.infer<typeof planFilesResultSchema>;

const systemPrompt = markdown`
Think step by step. Be concise and to the point. Do not make assumptions other than what was given in the instructions.
`;

const planFilesPromptText = (objective: string) =>
    markdown`
${objective}

Given the above objective produce a list of file paths to be edited. Return one file path per line in your response. File paths should be surrounded by a backtick. File paths should be relative to repository root. The result must be a numbered list in the format:

#. \`path/to/file.ts\`
#. \`path/to/another/file.ts\`

The number of each entry must be followed by a period. If the list of files is empty, write "There are no files to add at this time". Unless the list is empty, do not include any headers before the numbered list or follow the numbered list with any other output.
    `;

export const planFiles = makePipelineFunction({
    name: 'plan-files',
    inputSchema: planFilesInputSchema,
    resultSchema: planFilesResultSchema,
    transform: async (
        input,
        persistence,
        getDeps = makeDependencies
    ): Promise<PlanFilesResponse> => {
        const { includeFunctions } = getDeps();

        const userPrompt = planFilesPromptText(input.enrichedObjective);

        const { messages } = await promptWithFunctions(
            {
                preface: systemPrompt,
                prompt: userPrompt,
                temperature: 0,
                functions: await includeFunctions(),
                budgetCents: input.budgetCents,
                functionsConfig: {
                    repositoryRoot: input.sandboxDirectoryPath,
                    dependencies: getDeps,
                },
            },
            persistence
        );

        const lastMessage = messages[messages.length - 1];
        if (!lastMessage) {
            throw new Error(`No messages found after prompt`);
        }
        if (lastMessage.role !== 'assistant') {
            throw new Error(`Expected last message to be from assistant`);
        }
        if ('functionCall' in lastMessage) {
            throw new Error(`Expected last message to not be a function-call`);
        }

        const filePathRegex = /^\s*\d+\.\s*[`]([^`]+)[`]\s*/gm;

        return {
            plannedFiles: [...lastMessage.content.matchAll(filePathRegex)]
                .map(([, filePath]) => filePath)
                .filter(isTruthy),
        };
    },
});

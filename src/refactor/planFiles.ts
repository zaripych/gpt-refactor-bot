import { z } from 'zod';

import { diffHash } from '../git/diffHash';
import { markdown } from '../markdown/markdown';
import { makePipelineFunction } from '../pipeline/makePipelineFunction';
import { format } from '../text/format';
import { determineModelParameters } from './determineModelParameters';
import { validateAndParseListOfFiles } from './parsers/validateAndParseListOfFiles';
import { prompt } from './prompt';
import { refactorConfigSchema } from './types';

export const planFilesInputSchema = refactorConfigSchema
    .pick({
        budgetCents: true,
        model: true,
        modelByStepCode: true,
        useMoreExpensiveModelsOnRetry: true,
        scope: true,
        tsConfigJsonFileName: true,
        allowedFunctions: true,
    })
    .augment({
        objective: z.string(),
        sandboxDirectoryPath: z.string(),
        startCommit: z.string(),
        filesToEdit: z.array(z.string()),
    })
    .transform(async (input) => ({
        ...input,
        /**
         * @note result of this task depends on the source code state
         */
        ...(await diffHash({
            location: input.sandboxDirectoryPath,
            ref: input.startCommit,
        })),
    }));

export const planFilesResultSchema = z.object({
    /**
     * List of files that need refactoring to focus on one file at a time.
     */
    plannedFiles: z.array(z.string()),

    /**
     * When the list of files is empty, this field contains a short reasoning
     * provided by the bot.
     */
    reasoning: z.string().optional(),
});

export type PlanFilesResponse = z.infer<typeof planFilesResultSchema>;

const systemPrompt = markdown`
    Think step by step. Be concise and to the point. Do not make assumptions
    other than what was given in the instructions.
`;

const planFilesPromptText = (objective: string) =>
    format(
        /**
         * @note steps are numbered and refer to each other by number
         * in the text of the prompt
         */
        markdown`
            %objective%

            Given the above objective, follow the steps below:

            1. If the objective is already complete, respond "There are no files
               to edit at this time". Follow it with short sentence of reasoning
               why editing is not required.

            2. Use the tool box via OpenAI function calling to find all files
               that require editing and where the objective is not complete yet.

            3. If the resulting list from step #3 is empty, respond "There are
               no files to edit at this time". Follow it with short sentence of
               reasoning why editing is not required.

            4. If the resulting list from step #3 is not empty, format it -
               return one file path per line in your response. File paths should
               be surrounded by a backtick. File paths should be relative to
               repository root. The result must be a numbered list in the
               format:

            #. \`path/to/file.ts\`

            #. \`path/to/another/file.ts\`

            The number of each entry must be followed by a period. Do not prefix
            the list of files with any text.
        `,
        { objective }
    );

export const planFiles = makePipelineFunction({
    name: 'plan',
    inputSchema: planFilesInputSchema,
    resultSchema: planFilesResultSchema,
    transform: async (input, persistence): Promise<PlanFilesResponse> => {
        const plannedFilesResult = await prompt.withPersistence().transform(
            {
                preface: systemPrompt,
                prompt: planFilesPromptText(input.objective),
                budgetCents: input.budgetCents,
                temperature: 1,
                functionsConfig: {
                    repositoryRoot: input.sandboxDirectoryPath,
                    scope: input.scope,
                    tsconfigJsonFileName: input.tsConfigJsonFileName,
                    allowedFunctions: input.allowedFunctions,
                },
                shouldStop: async (message) => {
                    await validateAndParseListOfFiles({
                        sandboxDirectoryPath: input.sandboxDirectoryPath,
                        text: message.content,
                        sortBySize: false,
                    });
                    return true as const;
                },
                ...determineModelParameters(input, persistence),
            },
            persistence
        );

        const plannedFiles = await validateAndParseListOfFiles({
            sandboxDirectoryPath: input.sandboxDirectoryPath,
            text: plannedFilesResult.choices[0].resultingMessage.content,
            sortBySize: input.filesToEdit.length === 0,
        });

        const filesRequiredToEdit =
            input.filesToEdit.length > 0
                ? plannedFiles.filter((filePath) =>
                      input.filesToEdit.includes(filePath)
                  )
                : plannedFiles;

        return {
            plannedFiles: filesRequiredToEdit,
            ...(filesRequiredToEdit.length === 0 && {
                reasoning:
                    plannedFilesResult.choices[0].resultingMessage.content,
            }),
        };
    },
});

import { z } from 'zod';

import { markdown } from '../markdown/markdown';
import { makePipelineFunction } from '../pipeline/makePipelineFunction';
import { format } from '../text/format';
import { determineModelParameters } from './determineModelParameters';
import { validateAndParseListOfFiles } from './parsers/validateAndParseListOfFiles';
import { prompt } from './prompt';
import { refactorConfigSchema } from './types';

export const retrieveParametersInputSchema = refactorConfigSchema
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

export const retrieveParametersResultSchema = z.object({
    /**
     * List of files allowed to be edited or refactored when mentioned in the
     * objective, in the same order as mentioned in the objective.
     *
     * If the objective does not mention any files, this field is empty.
     */
    filesToEdit: z.array(z.string()),
});

export type RetrieveParametersResponse = z.infer<
    typeof retrieveParametersResultSchema
>;

const systemPrompt = markdown`
    Think step by step. Be concise and to the point. Do not make assumptions
    other than what was given in the instructions.
`;

const listFilesToEditPromptText = (objective: string) =>
    format(
        markdown`
            %objective%

            Given the above objective that implies modifications to source code,
            follow the steps below to determine the list of files the user wants
            us to edit or refactor.

            1. Check the objective for mentions of files to be changed, edited
               or refactored. Could be a single file or multiple files.

            2. If there is no mention of files respond "No mention of files to
               be edited or refactored".

            3. If the resulting list from step #1 is not empty, format it -
               return one file path per line in your response. File paths should
               be surrounded by a backtick. File paths should be relative to
               repository root. The result must be a numbered list in the
               format:

            #. \`path/to/file.ts\`

            #. \`path/to/another/file.ts\`

            The number of each entry must be followed by a period. Do not prefix
            the list of files with any text. Do not follow the list of files
            with any other text. If the objective asks to edit in a specific
            order, retain the order.
        `,
        {
            objective,
        }
    );

export const retrieveParameters = makePipelineFunction({
    name: 'retrieve-parameters',
    inputSchema: retrieveParametersInputSchema,
    resultSchema: retrieveParametersResultSchema,
    transform: async (input, persistence) => {
        const allowedFilesResult = await prompt(
            {
                preface: systemPrompt,
                prompt: listFilesToEditPromptText(input.objective),
                temperature: 0.2,
                budgetCents: input.budgetCents,
                functionsConfig: {
                    repositoryRoot: input.sandboxDirectoryPath,
                    scope: input.scope,
                    tsconfigJsonFileName: input.tsConfigJsonFileName,
                    /**
                     * @note we do not want to allow any functions for this prompt
                     */
                    allowedFunctions: [],
                },
                ...determineModelParameters(input, persistence),
                shouldStop: async (message) => {
                    await validateAndParseListOfFiles({
                        sandboxDirectoryPath: input.sandboxDirectoryPath,
                        text: message.content,
                        sortBySize: false,
                    });
                    return true as const;
                },
            },
            persistence
        );

        const filesToEdit = await validateAndParseListOfFiles({
            sandboxDirectoryPath: input.sandboxDirectoryPath,
            text: allowedFilesResult.choices[0].resultingMessage.content,
            sortBySize: false,
        });

        return {
            filesToEdit,
        };
    },
});

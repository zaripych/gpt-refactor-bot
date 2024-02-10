import { z } from 'zod';

import { makeCachedFunction } from '../cache/makeCachedFunction';
import { functionsRepositorySchema } from '../functions/prepareFunctionsRepository';
import { llmDependenciesSchema } from '../llm/llmDependencies';
import { markdown } from '../markdown/markdown';
import { format } from '../text/format';
import { validateAndParseListOfFiles } from './parsers/validateAndParseListOfFiles';
import { prompt } from './prompt';

export const determineFilesToEditInputSchema = z.object({
    objective: z.string(),
    sandboxDirectoryPath: z.string(),

    llmDependencies: llmDependenciesSchema,
    functionsRepository: functionsRepositorySchema,
});

export const determineFilesToEditResultSchema = z.object({
    /**
     * List of files allowed to be edited or refactored when mentioned in the
     * objective, in the same order as mentioned in the objective.
     *
     * If the objective does not mention any files, this field is empty.
     */
    filesToEdit: z.array(z.string()),
});

const systemPrompt = markdown`
    Think step by step. Be concise and to the point. Do not make assumptions and
    follow instructions exactly.
`;

const promptText = (opts: { objective: string }) =>
    format(
        markdown`
            <objective>
            %objective%
            </objective>

            Given the above objective that implies modifications to source code,
            determine the list of files the user wants us to edit or refactor.

            1. Check the objective for mentions of files to be changed, edited
               or refactored. Could be a single file or multiple files.

            2. If there is no mention of files respond "No mention of files to
               be edited or refactored".

            3. If the resulting list from step #1 is not empty, format it -
               return a numbered bullet list as shown below. File paths should
               be surrounded by a backtick. Retain the order of files as they
               appear in the objective.

            <example>
            1. \`path/to/file.ts\`
            2. \`path/to/another/file.ts\`
            </example>
        `,
        {
            objective: opts.objective,
        }
    );

export const determineFilesToEdit = makeCachedFunction({
    name: 'files-to-edit',
    inputSchema: determineFilesToEditInputSchema,
    resultSchema: determineFilesToEditResultSchema,
    transform: async (input, ctx) => {
        const allowedFilesResult = await prompt(
            {
                ...input,
                preface: systemPrompt,
                prompt: promptText({
                    objective: input.objective,
                }),
                temperature: 0.2,
                /**
                 * @note we do not want to allow any functions for this prompt
                 */
                allowedFunctions: [],
                shouldStop: async (message) => {
                    await validateAndParseListOfFiles({
                        sandboxDirectoryPath: input.sandboxDirectoryPath,
                        text: message.content,
                        sortBySize: false,
                    });
                    return true as const;
                },
            },
            ctx
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

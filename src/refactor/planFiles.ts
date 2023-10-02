import { stat } from 'fs/promises';
import { orderBy } from 'lodash-es';
import { join } from 'path';
import { z } from 'zod';

import type { RegularAssistantMessage } from '../chat-gpt/api';
import { diffHash } from '../git/diffHash';
import { markdown } from '../markdown/markdown';
import { makePipelineFunction } from '../pipeline/makePipelineFunction';
import { format } from '../text/format';
import { isTruthy } from '../utils/isTruthy';
import { determineModelParameters } from './determineModelParameters';
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
               that need editing.

            3. Check the objective if it explicitly mentions to limit the
               editing or refactoring only to a specific file or set of files.
               If there is no mention of files to be edited, continue on to step
               #4. Otherwise, take the files found from the list in step #2 and
               exclude any files that are not mentioned in the objective. This
               way we ensure the editing is focusing on files the user wants us
               to change.

            4. If the resulting list from step #3 is empty, respond "There are
               no files to edit at this time". Follow it with short sentence of
               reasoning why editing is not required.

            5. If the resulting list from step #3 is not empty, format it -
               return one file path per line in your response. File paths should
               be surrounded by a backtick. File paths should be relative to
               repository root. The result must be a numbered list in the
               format:

            #. \`path/to/file.ts\`

            #. \`path/to/another/file.ts\`

            The number of each entry must be followed by a period. Do not prefix
            the list of files with any text.

            Now, retrace your steps back without using the tool box via OpenAI
            calling and verify the list of files to be edited. Follow it with
            short sentence of reasoning why the list is correct.
        `,
        { objective }
    );

const validateParseAndOrderThePlan = async (opts: {
    sandboxDirectoryPath: string;
    message: RegularAssistantMessage;
}) => {
    const { sandboxDirectoryPath, message } = opts;
    const filePathRegex = /^\s*\d+\.\s*[`]([^`]+)[`]\s*/gm;

    const filePaths = [
        ...new Set(
            [...message.content.matchAll(filePathRegex)]
                .map(([, filePath]) => filePath)
                .filter(isTruthy)
        ),
    ];

    const filesInfos = await Promise.all(
        filePaths.map(async (filePath) => {
            const result = await stat(
                join(sandboxDirectoryPath, filePath)
            ).catch((error: NodeJS.ErrnoException) => {
                if (error.code === 'ENOENT') {
                    return null;
                }
                return Promise.reject(error);
            });
            return {
                filePath,
                size: result?.size,
            };
        })
    );

    const nonExistingFiles = filesInfos.filter(
        (file) => typeof file.size !== 'number'
    );

    if (nonExistingFiles.length > 0) {
        throw new Error(
            `Files at the following paths do not exist: ${nonExistingFiles
                .map(({ filePath }) => `\`${filePath}\``)
                .join(
                    ', '
                )}. Please specify file paths relative to the repository root found via the tool box.`
        );
    }

    const sorted = orderBy(filesInfos, ['size'], ['asc']);

    return sorted.map((info) => info.filePath);
};

export const planFiles = makePipelineFunction({
    name: 'plan',
    inputSchema: planFilesInputSchema,
    resultSchema: planFilesResultSchema,
    transform: async (input, persistence): Promise<PlanFilesResponse> => {
        const userPrompt = planFilesPromptText(input.objective);

        const { choices } = await prompt.withPersistence().transform(
            {
                preface: systemPrompt,
                prompt: userPrompt,
                budgetCents: input.budgetCents,
                temperature: 1,
                functionsConfig: {
                    repositoryRoot: input.sandboxDirectoryPath,
                    scope: input.scope,
                    tsconfigJsonFileName: input.tsConfigJsonFileName,
                    allowedFunctions: input.allowedFunctions,
                },
                shouldStop: async (message) => {
                    await validateParseAndOrderThePlan({
                        sandboxDirectoryPath: input.sandboxDirectoryPath,
                        message,
                    });
                    return true as const;
                },
                ...determineModelParameters(input, persistence),
            },
            persistence
        );

        const plannedFiles = await validateParseAndOrderThePlan({
            sandboxDirectoryPath: input.sandboxDirectoryPath,
            message: choices[0].resultingMessage,
        });

        return {
            plannedFiles,
            ...(plannedFiles.length === 0 && {
                reasoning: choices[0].resultingMessage.content,
            }),
        };
    },
});

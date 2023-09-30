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
});

export type PlanFilesResponse = z.infer<typeof planFilesResultSchema>;

const systemPrompt = markdown`
    Think step by step. Be concise and to the point. Do not make assumptions
    other than what was given in the instructions.
`;

const planFilesPromptText = (objective: string) =>
    format(
        markdown`
            %objective%

            Given the above objective we want to produce a list of file paths to
            be edited. To do that, use the OpenAI function calling to analyze
            current state of the code and produce a list based on state of the
            code. When the objective explicitly mentions to limit the
            refactoring only to specific file or files - only return a list from
            the subset mentioned. Return one file path per line in your
            response. File paths should be surrounded by a backtick. File paths
            should be relative to repository root. The result must be a numbered
            list in the format:

            #. \`path/to/file.ts\` #. \`path/to/another/file.ts\`

            The number of each entry must be followed by a period. If the list
            of files is empty, write "There are no files to add at this time".
            Unless the list is empty, do not include any headers before the
            numbered list or follow the numbered list with any other output.
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
        };
    },
});

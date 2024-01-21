import { z } from 'zod';

import { makeCachedFunction } from '../cache/makeCachedFunction';
import type { CacheStateRef } from '../cache/types';
import type { RegularAssistantMessage } from '../chat-gpt/api';
import { markdown } from '../markdown/markdown';
import { formatBulletList } from '../prompt-formatters/formatBulletList';
import { formatFileContents } from '../prompt-formatters/formatFileContents';
import { formatFileDiff } from '../prompt-formatters/formatFileDiff';
import { formatOptional } from '../prompt-formatters/formatOptional';
import { formatZodError } from '../prompt-formatters/formatZodError';
import {
    prompt,
    promptParametersFrom,
    refactorConfigPromptOptsSchema,
} from '../refactor/prompt';
import { parseJsonResponse } from '../response-parsers/parseJsonResponse';
import { format } from '../text/format';
import { line } from '../text/line';
import { ensureHasOneElement } from '../utils/hasOne';

export const evaluateFileChangesInput = refactorConfigPromptOptsSchema.augment({
    requirements: z.array(z.string()).nonempty(),
    filePath: z.string(),
    fileContentsBefore: z.string().optional(),
    fileContentsAfter: z.string().optional(),
    fileDiff: z.string().optional(),
    issues: z.array(z.string()).optional(),
    index: z.number().optional(),
    choices: z.number().optional(),
    temperature: z.number().optional(),
});

const promptResponseSchema = z.object({
    summary: z.string(),
    requirements: z.array(
        z.object({
            description: z.string(),
            satisfied: z.boolean(),
        })
    ),
});

export const evaluateFileResultSchema = z.object({
    key: z.string().optional(),
    choices: z.array(promptResponseSchema).nonempty(),
});

const systemPromptText = markdown`
    Think step by step. Be concise and to the point. Do not make assumptions and
    follow instructions exactly.
`;

const promptText = (opts: {
    requirements: string[];
    filePath: string;
    fileContentsBefore: string;
    fileContentsAfter: string;
    fileDiff: string;
    issues: string[];
}) =>
    format(
        markdown`
            <requirements>
            %requirements%
            </requirements>

            Given above requirements, an algorithm has made modifications to the
            file at \`%filePath%\`. We now want to assess changes in that file.
            Strictly focus only on the file mentioned.

            Below information is available to you and applies only to the file
            \`%filePath%\`:

            %fileDiff%

            %fileContentsAfter%

            %issues%

            Assess the changes made by the algorithm and determine whether the
            requirement was satisfied or not. Do not add new requirements. Do
            not rephrase requirements. Do not change order of the requirements.
            Do not assess the quality of the implementation in relation to the
            requirement, but focus on the outcome. The number of requirements
            returned should be the same as the number of requirements given.

            Return the following JSON result when you are done:

            ~~~json
            {
                "summary": "<summary of the assessment>",
                "requirements": [
                    {
                        "description": "<requirement>",
                        "satisfied": <true/false - whether requirement is satisfied or not>
                    }
                ]
            }
            ~~~

            In your final response, only include the JSON in the above format
            wrapped with the code block. Do not include any other text or
            output.
        `,
        {
            requirements: formatBulletList({
                items: ensureHasOneElement(opts.requirements),
                heading: `List of requirements:`,
            }),
            filePath: opts.filePath,
            fileDiff: formatOptional({
                heading: 'Following changes were made to the file:',
                text: formatFileDiff({
                    fileDiff: opts.fileDiff,
                }),
            }),
            fileContentsAfter: formatOptional({
                heading: 'File contents after the changes:',
                text: formatFileContents({
                    fileContents: opts.fileContentsAfter,
                    filePath: opts.filePath,
                }),
            }),
            issues: formatBulletList({
                heading: 'Following issues were found after the changes:',
                empty: line`
                    We've checked the code for issues - no issues were found.
                `,
                items: opts.issues,
            }),
        }
    );

export const evaluateFileChanges = makeCachedFunction({
    name: 'eval-file',
    inputSchema: evaluateFileChangesInput,
    resultSchema: evaluateFileResultSchema,
    transform: async (
        input: z.input<typeof evaluateFileChangesInput>,
        ctx?: CacheStateRef
    ) => {
        const {
            filePath,
            requirements,
            fileDiff,
            fileContentsBefore,
            fileContentsAfter,
            issues = [],
        } = input;

        const validateResponse = (message: RegularAssistantMessage) =>
            parseJsonResponse(
                message.content,
                z.object({
                    summary: z.string(),
                    requirements: z.array(
                        z.object({
                            description: z.string(),
                            satisfied: z.boolean(),
                        })
                    ),
                })
            );

        const promptParams = promptParametersFrom(
            {
                ...input,
                allowedFunctions: [],
            },
            ctx
        );

        const result = await prompt(
            {
                preface: systemPromptText,
                prompt: promptText({
                    filePath,
                    requirements,
                    fileDiff: fileDiff || '',
                    fileContentsBefore: fileContentsBefore || '',
                    fileContentsAfter: fileContentsAfter || '',
                    issues,
                }),
                temperature: input.temperature ?? 0.2,
                choices: input.choices,
                shouldStop: (message) => {
                    try {
                        validateResponse(message);
                        return true;
                    } catch (err) {
                        if (err instanceof z.ZodError) {
                            return formatZodError({
                                error: err,
                            });
                        }
                        return String(err);
                    }
                },
                ...promptParams,
                seed: input.index?.toString(),
            },
            ctx
        );

        return {
            key: result.key,
            choices: ensureHasOneElement(
                result.choices.map((choice) =>
                    validateResponse(choice.resultingMessage)
                )
            ),
        };
    },
});

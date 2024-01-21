import { z } from 'zod';

import { makeCachedFunction } from '../cache/makeCachedFunction';
import type { CacheStateRef } from '../cache/types';
import type { RegularAssistantMessage } from '../chat-gpt/api';
import { markdown } from '../markdown/markdown';
import { formatBulletList } from '../prompt-formatters/formatBulletList';
import { formatFileContents } from '../prompt-formatters/formatFileContents';
import { formatOptional } from '../prompt-formatters/formatOptional';
import {
    prompt,
    promptParametersFrom,
    refactorConfigPromptOptsSchema,
} from '../refactor/prompt';
import { parseJsonResponse } from '../response-parsers/parseJsonResponse';
import { format } from '../text/format';
import { line } from '../text/line';
import { ensureHasOneElement } from '../utils/hasOne';
import { evaluateFileResultSchema } from './evaluateFileChanges';

export const evaluateUnchangedFileInput =
    refactorConfigPromptOptsSchema.augment({
        requirements: z.array(z.string()).nonempty(),
        filePath: z.string(),
        fileContents: z.string(),
        issues: z.array(z.string()).optional(),
        index: z.number().optional(),
        choices: z.number().optional(),
        temperature: z.number().optional(),
    });

const systemPromptText = markdown`
    Think step by step. Be concise and to the point. Do not make assumptions
    other than what was given in the instructions.
`;

const promptText = (opts: {
    requirements: [string, ...string[]];
    filePath: string;
    fileContents: string;
    issues?: string[];
}) =>
    format(
        markdown`
            <requirements>
            %requirements%
            </requirements>

            Given above requirements, an algorithm has decided to include the
            file \`%filePath%\` into refactoring, but after that, decided not to
            make modifications to that file. We now want to assess whether the
            decision aligns with the requirements.

            Below information is available to you and applies only to the file
            \`%filePath%\`:

            %fileContents%

            %issues%

            Assess the decision made by the algorithm and determine whether the
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
                        "description": "<short description of the requirement>",
                        "satisfied": true
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
            fileContents: formatOptional({
                heading: 'File contents:',
                text: formatFileContents({
                    fileContents: opts.fileContents,
                    filePath: opts.filePath,
                }),
            }),
            issues: opts.issues
                ? formatBulletList({
                      heading: 'Following issues were found in the file:',
                      empty: line`
                          We've checked the file for issues - no issues were
                          found.
                      `,
                      items: opts.issues,
                  })
                : '',
        }
    );

export const evaluateUnchangedFile = makeCachedFunction({
    name: 'eval-file',
    inputSchema: evaluateUnchangedFileInput,
    resultSchema: evaluateFileResultSchema,
    transform: async (
        input: z.input<typeof evaluateUnchangedFileInput>,
        ctx?: CacheStateRef
    ) => {
        const { filePath, requirements, fileContents, issues } = input;

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
                    fileContents,
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
                            return err.message;
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

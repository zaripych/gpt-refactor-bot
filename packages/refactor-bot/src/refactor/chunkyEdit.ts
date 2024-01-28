import hash from 'object-hash';
import { z } from 'zod';

import { makeCachedFunction } from '../cache/makeCachedFunction';
import type { RegularAssistantMessage } from '../chat-gpt/api';
import { autoFixIssuesContents } from '../eslint/autoFixIssues';
import { logger } from '../logger/logger';
import { markdown } from '../markdown/markdown';
import { prettierTypescript } from '../prettier/prettier';
import { parseFencedCodeBlocks } from '../response-parsers/parseFencedCodeBlocks';
import { parseJsonResponse } from '../response-parsers/parseJsonResponse';
import { format } from '../text/format';
import { line } from '../text/line';
import { hasOneElement } from '../utils/hasOne';
import { applyFindAndReplace } from './applyFindAndReplace';
import {
    prompt,
    promptParametersFrom,
    refactorConfigPromptOptsSchema,
} from './prompt';

export const editInputSchema = refactorConfigPromptOptsSchema.augment({
    objective: z.string(),
    filePath: z.string(),
    fileContents: z.string(),
    eslintAutoFixScriptArgs: z.array(z.string()).nonempty().optional(),
    prettierScriptLocation: z.string().optional(),
    choices: z.number().optional(),
});

const singleChoiceResultSchema = z.discriminatedUnion('status', [
    z.object({
        status: z.literal('success'),
        fileContentsHash: z.string(),
        fileContents: z.string(),
        key: z.string().optional(),
    }),
    z.object({
        status: z.literal('no-changes-required'),
        key: z.string().optional(),
    }),
]);

export const editResultSchema = z.object({
    choices: z.array(singleChoiceResultSchema).nonempty(),
});

export type EditResponse = z.infer<typeof editResultSchema>;

const preface = markdown`
    Think step by step. Be concise and to the point. Do not make assumptions and
    follow instructions exactly. Produce minimal changes in the code to
    accomplish the task. Attempt to make changes to the code that are backward
    compatible with the rest of the codebase.
`;

const promptText = (opts: { objective: string; filePath: string }) =>
    format(
        markdown`
            %objective%

            As a result - produce changes to \`%filePath%\` with the task
            performed.

            Return list of changes in the following format:

            ~~~json
            [
                {
                    "findAll": "find this line in the file",
                    "replace": "replace all occurrences with this line"
                },
                {
                    "find": "find another line in the file",
                    "occurrence": 0, // occurrence starts from 0
                    "replace": "replace only first occurrence with this line"
                }
            ]
            ~~~

            Use "find" to replace single occurrence and "findAll" to replace all
            occurrences.

            Ensure that the text being replaced is present in the file.

            Ensure that the text being replaced is an entire line or multiple
            lines including indentation or whitespace.

            Ensure that the text being replaced is non-ambiguous. If there are
            multiple entries in the file for the text, include more context to
            make it unambiguous.

            Ensure that the text being replaced is unique.

            Ensure to include "occurrence" if there are multiple occurrences of
            the same text in the file and the replacement text is different.

            Do not worry about line breaks or formatting the code, it will be
            formatted automatically after the modifications using "prettier".

            When replacing multiple consecutive lines, prefer combining them
            into a single replacement operation.
        `,
        opts
    );

export const chunkyEdit = makeCachedFunction({
    name: 'chunky-edit',
    inputSchema: editInputSchema,
    resultSchema: editResultSchema,
    transform: async (input, ctx): Promise<EditResponse> => {
        const text = promptText({
            objective: input.objective,
            filePath: input.filePath,
        });

        const promptOpts = promptParametersFrom(input, ctx);

        const verifyResponse = async (message: RegularAssistantMessage) => {
            const blocks = parseFencedCodeBlocks(message.content);
            const noChangesRegex = /No changes required/gm;

            const noChangesRequired = noChangesRegex.test(message.content);

            if (noChangesRequired && blocks.length === 0) {
                return {
                    key: ctx.location,
                    status: 'no-changes-required' as const,
                };
            }

            if (!hasOneElement(blocks)) {
                throw new Error(
                    line`
                        Expected a single code chunk in response, got
                        ${blocks.length} chunks
                    `
                );
            }

            const parsedResponse = parseJsonResponse(
                message.content,
                z.array(
                    z.union([
                        z.object({
                            find: z.string(),
                            occurrence: z.number().optional(),
                            replace: z.string(),
                        }),
                        z.object({
                            findAll: z.string(),
                            replace: z.string(),
                        }),
                    ])
                )
            );

            const codeChunk = applyFindAndReplace({
                text: input.fileContents,
                blocks: parsedResponse,
            });

            const formattedCodeChunk = await prettierTypescript({
                prettierScriptLocation: input.prettierScriptLocation,
                repositoryRoot: input.sandboxDirectoryPath,
                ts: codeChunk,
                throwOnParseError: true,
            });

            const eslintFixed = input.eslintAutoFixScriptArgs
                ? (
                      await autoFixIssuesContents(
                          {
                              eslintScriptArgs: input.eslintAutoFixScriptArgs,
                              fileContents: formattedCodeChunk,
                              filePath: input.filePath,
                              location: input.sandboxDirectoryPath,
                          },
                          ctx
                      )
                  ).contents
                : formattedCodeChunk;

            if (input.eslintAutoFixScriptArgs) {
                if (
                    eslintFixed === input.fileContents &&
                    formattedCodeChunk !== input.fileContents
                ) {
                    throw new Error(
                        line`
                            eslint reverted the code changes as they do not
                            pass the eslint formatting rules. Please do not
                            make similar changes in the future to avoid cycles.
                        `
                    );
                }
            }

            if (eslintFixed === input.fileContents) {
                return {
                    key: ctx.location,
                    status: 'no-changes-required' as const,
                };
            }

            return {
                key: ctx.location,
                fileContentsHash: hash(eslintFixed),
                fileContents: eslintFixed,
                status: 'success' as const,
            };
        };

        const { choices } = await prompt(
            {
                preface,
                prompt: text,
                temperature: 1,
                choices: input.choices,
                ...promptOpts,
                shouldStop: async (message) => {
                    await verifyResponse(message);
                    return true as const;
                },
            },
            ctx
        );

        const settledChoices = await Promise.allSettled(
            choices.map((choice) => verifyResponse(choice.resultingMessage))
        );

        const result = settledChoices.flatMap((choice) => {
            if (choice.status === 'rejected') {
                return [];
            }

            return [choice.value];
        });

        if (!hasOneElement(result)) {
            if (choices.length === 0) {
                throw new Error('No choices returned by the model');
            } else {
                settledChoices
                    .flatMap((choice) =>
                        choice.status === 'rejected'
                            ? [choice.reason as Error]
                            : []
                    )
                    .forEach((err) => {
                        logger.error(err);
                    });

                throw new AggregateError(
                    settledChoices.flatMap((choice) =>
                        choice.status === 'rejected'
                            ? [choice.reason as Error]
                            : []
                    ),
                    'All choices returned by the model failed validation'
                );
            }
        }

        return {
            choices: result,
        };
    },
});

import hash from 'object-hash';
import { z } from 'zod';

import { makeCachedFunction } from '../cache/makeCachedFunction';
import type { RegularAssistantMessage } from '../chat-gpt/api';
import { autoFixIssuesContents } from '../eslint/autoFixIssues';
import { logger } from '../logger/logger';
import { markdown } from '../markdown/markdown';
import { prettierTypescript } from '../prettier/prettier';
import { parseFencedCodeBlocks } from '../response-parsers/parseFencedCodeBlocks';
import { format } from '../text/format';
import { line } from '../text/line';
import { hasOneElement } from '../utils/hasOne';
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
    Think step by step. Do not make assumptions other than what was given in the
    instructions. Produce minimal changes in the code to accomplish the task.
    Attempt to make changes to the code that are backward compatible with the
    rest of the codebase.
`;

const promptText = (opts: { objective: string; filePath: string }) =>
    format(
        markdown`
            %objective%

            As a result - produce modified contents of the entire file
            \`%filePath%\` with the task performed. Modified code must be
            surrounded with markdown code fences (ie "\`\`\`"). The modified
            code should represent the entire file contents.

            If no modifications required - respond with "No changes required"
            without any reasoning.

            Do not respond with any other text other than the modified code or
            "No changes required".

            Do not include any code blocks when responding with "No changes
            required".

            Do not include unmodified code when responding with "No changes
            required".

            Do not include "No changes required" when responding with modified
            code.

            Example response #1:

            ~~~TypeScript
            /* entire contents of the file omitted in the example */
            ~~~

            Example response #2:

            No changes required.
        `,
        opts
    );

export const edit = makeCachedFunction({
    name: 'edit',
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
                        Expected to find a single code chunk, but found
                        ${blocks.length}
                    `
                );
            }

            if (!blocks[0].code) {
                throw new Error(`Expected a non-empty code chunk in response`);
            }

            const codeChunk = blocks[0].code;

            const formattedCodeChunk = await prettierTypescript({
                prettierScriptLocation: input.prettierScriptLocation,
                repositoryRoot: input.sandboxDirectoryPath,
                ts: codeChunk,
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

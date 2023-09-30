import hash from 'object-hash';
import type { TypeOf } from 'zod';
import { z } from 'zod';

import { autoFixIssuesContents } from '../eslint/autoFixIssues';
import { logger } from '../logger/logger';
import { markdown } from '../markdown/markdown';
import { makePipelineFunction } from '../pipeline/makePipelineFunction';
import { prettierTypescript } from '../prettier/prettier';
import { format } from '../text/format';
import { hasOneElement } from '../utils/hasOne';
import { isTruthy } from '../utils/isTruthy';
import { determineModelParameters } from './determineModelParameters';
import { prompt } from './prompt';
import { refactorConfigSchema } from './types';

export const editInputSchema = refactorConfigSchema
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
        filePath: z.string(),
        fileContents: z.string(),
        sandboxDirectoryPath: z.string(),
        eslintAutoFixScriptArgs: z.array(z.string()).nonempty().optional(),
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
    rest of the code base.
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

export const edit = makePipelineFunction({
    name: 'edit',
    inputSchema: editInputSchema,
    resultSchema: editResultSchema,
    transform: async (input, persistence): Promise<EditResponse> => {
        const text = promptText({
            objective: input.objective,
            filePath: input.filePath,
        });

        const { choices } = await prompt.withPersistence().transform(
            {
                preface,
                prompt: text,
                temperature: 1,
                budgetCents: input.budgetCents,
                functionsConfig: {
                    repositoryRoot: input.sandboxDirectoryPath,
                    scope: input.scope,
                    tsconfigJsonFileName: input.tsConfigJsonFileName,
                    allowedFunctions: input.allowedFunctions,
                },
                ...determineModelParameters(input, persistence),
                choices: input.choices,
            },
            persistence
        );

        const settledChoices = await Promise.allSettled(
            choices.map(
                async ({
                    resultingMessage: lastMessage,
                }): Promise<TypeOf<typeof singleChoiceResultSchema>> => {
                    const codeRegex = /```\w+\s*((.|\n(?!```))*)\s*```/gm;
                    const noChangesRegex = /No changes required/gm;

                    const codeChunks = [
                        ...lastMessage.content.matchAll(codeRegex),
                    ]
                        .map(([, code]) => code)
                        .filter(isTruthy);

                    const noChangesRequired = noChangesRegex.test(
                        lastMessage.content
                    );

                    if (noChangesRequired && codeChunks.length === 0) {
                        return {
                            key: persistence?.location,
                            status: 'no-changes-required' as const,
                        };
                    }

                    if (codeChunks.length !== 1) {
                        throw new Error(
                            `Expected to find a single code ` +
                                `chunk, but found ${codeChunks.length}`
                        );
                    }

                    if (!codeChunks[0]) {
                        throw new Error(
                            `Expected a non-empty code chunk in response`
                        );
                    }

                    const codeChunk = codeChunks[0];

                    const formattedCodeChunk =
                        await prettierTypescript(codeChunk);
                    const eslintFixed = input.eslintAutoFixScriptArgs
                        ? await autoFixIssuesContents({
                              eslintScriptArgs: input.eslintAutoFixScriptArgs,
                              fileContents: formattedCodeChunk,
                              filePath: input.filePath,
                              location: input.sandboxDirectoryPath,
                          })
                        : formattedCodeChunk;

                    if (input.eslintAutoFixScriptArgs) {
                        if (
                            eslintFixed === input.fileContents &&
                            formattedCodeChunk !== input.fileContents
                        ) {
                            throw new Error(
                                'ESLint just reverted the code changes made by the model, this is not supposed to happen'
                            );
                        }
                    }

                    if (eslintFixed === input.fileContents) {
                        return {
                            key: persistence?.location,
                            status: 'no-changes-required' as const,
                        };
                    }

                    return {
                        key: persistence?.location,
                        fileContentsHash: hash(eslintFixed),
                        fileContents: eslintFixed,
                        status: 'success' as const,
                    };
                }
            )
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

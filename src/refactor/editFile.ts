import hash from 'object-hash';
import { z } from 'zod';

import { markdown } from '../markdown/markdown';
import { makePipelineFunction } from '../pipeline/makePipelineFunction';
import { prettierTypescript } from '../prettier/prettier';
import { isTruthy } from '../utils/isTruthy';
import { makeDependencies } from './dependencies';
import { determineModelParameters } from './determineModelParameters';
import { promptWithFunctions } from './promptWithFunctions';
import { refactorConfigSchema } from './types';

export const editFileInputSchema = refactorConfigSchema
    .pick({
        budgetCents: true,
        model: true,
        modelByStepCode: true,
        useMoreExpensiveModelsOnRetry: true,
    })
    .augment({
        objective: z.string(),
        filePath: z.string(),
        fileContents: z.string(),
        sandboxDirectoryPath: z.string(),
    });

export const editFileResultSchema = z.object({
    status: z.enum(['success', 'no-changes-required']),
    key: z.string().optional(),
    fileContentsHash: z.string().optional(),
    fileContents: z.string().optional(),
});

export type EditFileResponse = z.infer<typeof editFileResultSchema>;

const preface = markdown`
Think step by step. Do not make assumptions other than what was given in the instructions. Produce minimal changes in the code to accomplish the task. Attempt to make changes to the code that are backward compatible with the rest of the code base.
`;

const promptText = (opts: { objective: string; filePath: string }) =>
    markdown`${opts.objective}

As a result - produce modified contents of the entire file \`${opts.filePath}\` with the task performed. Modified code must be surrounded with markdown code fences (ie "\`\`\`"). The modified code should represent the entire file contents.

If no modifications required - respond with "No changes required" without any reasoning.

Do not respond with any other text other than the modified code or "No changes required".

Do not include any code blocks when responding with "No changes required".

Do not include unmodified code when responding with "No changes required".

Do not include "No changes required" when responding with modified code.

Example response #1:

\`\`\`TypeScript
/* entire contents of the file omitted in the example */
\`\`\`

Example response #2:

No changes required.`;

export const editFilePrompt = makePipelineFunction({
    name: 'edit',
    inputSchema: editFileInputSchema,
    resultSchema: editFileResultSchema,
    transform: async (
        input,
        persistence,
        getDeps = makeDependencies
    ): Promise<EditFileResponse> => {
        const { includeFunctions } = getDeps();

        const prompt = promptText({
            objective: input.objective,
            filePath: input.filePath,
        });

        const { messages } = await promptWithFunctions(
            {
                preface,
                prompt,
                temperature: 1,
                functions: await includeFunctions(),
                budgetCents: input.budgetCents,
                functionsConfig: {
                    repositoryRoot: input.sandboxDirectoryPath,
                    dependencies: getDeps,
                },
                ...determineModelParameters(input, persistence),
            },
            persistence
        );

        const lastMessage = messages[messages.length - 1];
        if (!lastMessage) {
            throw new Error(`No messages found after prompt`);
        }
        if (lastMessage.role !== 'assistant') {
            throw new Error(`Expected last message to be from assistant`);
        }
        if ('functionCall' in lastMessage) {
            throw new Error(`Expected last message to not be a function-call`);
        }

        const codeRegex = /```\w+\s*((.|\n(?!```))*)\s*```/gm;
        const noChangesRegex = /No changes required/gm;

        const codeChunks = [...lastMessage.content.matchAll(codeRegex)]
            .map(([, code]) => code)
            .filter(isTruthy);

        const noChangesRequired = noChangesRegex.test(lastMessage.content);

        if (noChangesRequired && codeChunks.length === 0) {
            return {
                key: persistence?.location,
                status: 'no-changes-required',
                fileContents: undefined,
            };
        }

        if (codeChunks.length !== 1) {
            throw new Error(
                `Expected to find a single code ` +
                    `chunk, but found ${codeChunks.length}`
            );
        }

        if (!codeChunks[0]) {
            throw new Error(`Expected a non-empty code chunk in response`);
        }

        const codeChunk = codeChunks[0];

        const formattedCodeChunk = await prettierTypescript(codeChunk);

        if (formattedCodeChunk === input.fileContents) {
            return {
                key: persistence?.location,
                status: 'no-changes-required',
                fileContents: undefined,
            };
        }

        return {
            key: persistence?.location,
            fileContentsHash: hash(formattedCodeChunk),
            fileContents: formattedCodeChunk,
            status: 'success',
        };
    },
});

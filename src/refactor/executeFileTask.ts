import { readFile } from 'fs/promises';
import hash from 'object-hash';
import { join } from 'path';
import { z } from 'zod';

import { markdown } from '../markdown/markdown';
import { makePipelineFunction } from '../pipeline/makePipelineFunction';
import { prettierTypescript } from '../prettier/prettier';
import { isTruthy } from '../utils/isTruthy';
import { makeDependencies } from './dependencies';
import { promptWithFunctions } from './promptWithFunctions';
import { refactorConfigSchema } from './types';

export const executeFileTaskInputSchema = refactorConfigSchema
    .pick({
        budgetCents: true,
        lintScripts: true,
        testScripts: true,
    })
    .augment({
        enrichedObjective: z.string(),
        filePath: z.string(),
        fileDiff: z.string(),
        issues: z.array(z.string()),
        task: z.string(),
        completedTasks: z.array(z.string()),
        sandboxDirectoryPath: z.string(),
    });

export const executeFileTaskResultSchema = z.object({
    status: z.enum(['success', 'no-changes-required']),
    fileContentsHash: z.string().optional(),
    fileContents: z.string().optional(),
});

export type ExecuteTaskResponse = z.infer<typeof executeFileTaskResultSchema>;

const preface = markdown`
Think step by step. Be concise. Do not make assumptions other than what was given in the instructions. Produce minimal changes in the code to accomplish the task.
`;

const executeFileTaskPromptText = (opts: {
    objective: string;
    filePath: string;
    fileContents: string;
    task: string;
    completedTasks: string[];
    fileDiff?: string;
    issues: string[];
    language: string;
}) =>
    markdown`
${opts.objective}

We are now starting the process of refactoring one file at a time. Strictly focus only on a single file given below.

Given the contents of the file: \`${opts.filePath}\`:

\`\`\`${opts.language}
${opts.fileContents}
\`\`\`

${
    opts.completedTasks.length > 0
        ? `You already have completed the following tasks:

${opts.completedTasks.map((task, index) => `${index + 1}. ${task}`).join('\n')}
`
        : ''
}${
        opts.fileDiff
            ? `The changes have produced the following diff so far:
\`\`\`diff
${opts.fileDiff}
\`\`\`
`
            : ''
    }${
        opts.issues.length > 0
            ? `The following issues were found after linting and testing of your changes:

${opts.issues.map((issue, index) => `${index + 1}. ${issue}`).join('\n')}
`
            : ''
    }

We are further focusing on a single task to eventually achieve the ultimate objective.

Please perform the following task:

${opts.completedTasks.length + 1}. ${opts.task}

As a result - produce modified contents of the entire file \`${
        opts.filePath
    }\` with the task performed. Modified code must be surrounded with markdown code fences (ie "\`\`\`"). The modified code should represent the entire file contents.

It is also possible that as a result of the task - no changes are required. In that case - respond with "No changes required" without any reasoning.

Do not respond with any other text other than the modified code or "No changes required".

Do not include any code blocks when responding with "No changes required".

Do not include unmodified code when responding with "No changes required".

Do not include "No changes required" when responding with modified code.

Example response #1:

\`\`\`TypeScript
/* entire contents of the file omitted in the example */
\`\`\`

Example response #2:

No changes required.
`;

export const executeFileTask = makePipelineFunction({
    name: 'execute',
    inputSchema: executeFileTaskInputSchema,
    resultSchema: executeFileTaskResultSchema,
    transform: async (
        input,
        persistence,
        getDeps = makeDependencies
    ): Promise<ExecuteTaskResponse> => {
        const { includeFunctions } = getDeps();

        const prompt = executeFileTaskPromptText({
            objective: input.enrichedObjective,
            task: input.task,
            filePath: input.filePath,
            fileContents: await readFile(
                join(input.sandboxDirectoryPath, input.filePath),
                'utf-8'
            ),
            completedTasks: input.completedTasks,
            language: 'TypeScript',
            fileDiff: input.fileDiff,
            issues: input.issues,
        });

        const { messages } = await promptWithFunctions(
            {
                preface,
                prompt,
                temperature: 0,
                functions: await includeFunctions(),
                budgetCents: input.budgetCents,
                functionsConfig: {
                    repositoryRoot: input.sandboxDirectoryPath,
                    dependencies: getDeps,
                },
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

        if (noChangesRequired && codeChunks.length > 0) {
            throw new Error(
                `Expected no modified code chunks when response ` +
                    `contains "No changes required", but found ` +
                    `${codeChunks.length}.`
            );
        }

        if (noChangesRequired) {
            return {
                status: 'no-changes-required',
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

        return {
            fileContentsHash: hash(formattedCodeChunk),
            fileContents: formattedCodeChunk,
            status: 'success',
        };
    },
});

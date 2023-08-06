import { readFile } from 'fs/promises';
import { join } from 'path';
import { z } from 'zod';

import { gitDiffFile } from '../git/gitDiffFile';
import { markdown } from '../markdown/markdown';
import { determinePackageManager } from '../package-manager/determinePackageManager';
import { makePipelineFunction } from '../pipeline/makePipelineFunction';
import { prettierTypescript } from '../prettier/prettier';
import { isTruthy } from '../utils/isTruthy';
import { makeDependencies } from './dependencies';
import { promptWithFunctions } from './promptWithFunctions';
import { runAllCheckCommands } from './runCheckCommand';
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
        defaultBranch: z.string(),
        task: z.string(),
        completedTasks: z.array(z.string()),
        sandboxDirectoryPath: z.string(),
    });

export const executeFileTaskResultSchema = z.object({
    status: z.enum(['success', 'no-changes-required']),
    fileContents: z.string().optional(),
});

export type ExecuteTaskResponse = z.infer<typeof executeFileTaskResultSchema>;

const preface = markdown`
Think step by step. Be concise and to the point. Do not make assumptions other than what was given in the instructions.
`;

const executeFileTaskPromptText = (opts: {
    objective: string;
    filePath: string;
    fileContents: string;
    task: string;
    completedTasks: string[];
    diff?: string;
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
        ? `We have completed the following tasks:

${opts.completedTasks.map((task, index) => `${index + 1}. ${task}`).join('\n')}
`
        : ''
}${
        opts.diff
            ? `The changes have produced the following diff:
\`\`\`diff
${opts.diff}
\`\`\`
`
            : ''
    }${
        opts.issues.length > 0
            ? `The following issues were found after linting and testing:

${opts.issues.map((issue, index) => `${index + 1}. ${issue}`).join('\n')}
`
            : ''
    }

We are further focusing on a single task to eventually achieve the ultimate objective.

Please perform the following task:

${opts.completedTasks.length + 1}. ${opts.task}

As a result - produce modified contents of the file \`${
        opts.filePath
    }\` with the task performed. Modified code must be surrounded with markdown code fences (ie "\`\`\`").
    
When modifications are not required - do not include any code in the response and respond simply with "No changes required" without any reasoning. 

Do not include any headers before the modified contents or follow the modified contents with any other output. 

    `;

export const executeFileTask = makePipelineFunction({
    name: 'execute-file-task',
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
            diff: await gitDiffFile({
                filePath: input.filePath,
                location: input.sandboxDirectoryPath,
                ref: input.defaultBranch,
            }),
            issues: await runAllCheckCommands({
                packageManager: await determinePackageManager({
                    directory: input.sandboxDirectoryPath,
                }),
                location: input.sandboxDirectoryPath,
                filePaths: [input.filePath],
                scripts: [...input.lintScripts, ...input.testScripts],
            }),
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
            fileContents: formattedCodeChunk,
            status: 'success',
        };
    },
});

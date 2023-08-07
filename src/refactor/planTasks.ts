import { readFile } from 'fs/promises';
import { join } from 'path';
import { z } from 'zod';

import { gitFilesDiff } from '../git/gitFilesDiff';
import { markdown } from '../markdown/markdown';
import { makePipelineFunction } from '../pipeline/makePipelineFunction';
import { isTruthy } from '../utils/isTruthy';
import { makeDependencies } from './dependencies';
import { promptWithFunctions } from './promptWithFunctions';
import { refactorConfigSchema } from './types';

export const planTasksInputSchema = refactorConfigSchema
    .pick({
        budgetCents: true,
    })
    .augment({
        enrichedObjective: z.string(),
        filePath: z.string(),
        sandboxDirectoryPath: z.string(),
        startCommit: z.string(),
    })
    .transform(async (input) => ({
        ...input,
        /**
         * @note result of this task depends on the source code state
         */
        ...(input.startCommit && {
            fileDiff: await gitFilesDiff({
                location: input.sandboxDirectoryPath,
                filePaths: [input.filePath],
                ref: input.startCommit,
            }),
        }),
    }));

export const planTasksResultSchema = z.object({
    /**
     * List of tasks to take to refactor the file.
     */
    tasks: z.array(z.string()),
});

export type PlanTasksResponse = z.infer<typeof planTasksResultSchema>;

const systemPrompt = markdown`
Think step by step. Be concise and to the point. Do not make assumptions other than what was given in the instructions.
`;

const planTasksPromptText = (opts: {
    objective: string;
    filePath: string;
    fileContents: string;
}) =>
    markdown`
${opts.objective}

We are now starting the process of refactoring one file at a time. Strictly focus only on the file given below.

Given the contents of the file: \`${opts.filePath}\`:

\`\`\`TypeScript
${opts.fileContents}
\`\`\`

Please produce the task list to accomplish the objective for the given file. Return one task per line in your response. Each task should be focused only on the single file mentioned.

The response must be a numbered list in the format:

#. First task
#. Second task

The number of each entry must be followed by a period. If the list of tasks is empty, write "There are no tasks to add at this time" and nothing else.

Unless your list is empty, do not include any headers before your numbered list or follow your numbered list with any other output.

Strictly only list tasks that would result in code changes to the file, do not include any other tasks similar to below:

1. Execute build and lint scripts to check for errors.
2. Execute tests for all changed files.
3. Verify if the objective is complete.
4. Commit and push to remote repository.
5. Open a pull request with the changes.
6. Request a review from the repository owners.
7. Save the changes to the file.
    `;

export const planTasks = makePipelineFunction({
    name: 'plan-tasks',
    inputSchema: planTasksInputSchema,
    resultSchema: planTasksResultSchema,
    transform: async (
        input,
        persistence,
        getDeps = makeDependencies
    ): Promise<PlanTasksResponse> => {
        const { includeFunctions } = getDeps();

        const userPrompt = planTasksPromptText({
            objective: input.enrichedObjective,
            fileContents: await readFile(
                join(input.sandboxDirectoryPath, input.filePath),
                'utf-8'
            ),
            filePath: input.filePath,
        });

        const { messages } = await promptWithFunctions(
            {
                preface: systemPrompt,
                prompt: userPrompt,
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

        const tasksRegex = /^\s*\d+\.\s*([^\n]+)\s*/gm;

        return {
            tasks: [...lastMessage.content.matchAll(tasksRegex)]
                .map(([, task]) => task)
                .filter(isTruthy),
        };
    },
});

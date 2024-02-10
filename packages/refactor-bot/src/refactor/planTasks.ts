import { readFile } from 'fs/promises';
import { join } from 'path';
import { z } from 'zod';

import { makeCachedFunction } from '../cache/makeCachedFunction';
import { functionsRepositorySchema } from '../functions/prepareFunctionsRepository';
import { gitFilesDiff } from '../git/gitFilesDiff';
import { llmDependenciesSchema } from '../llm/llmDependencies';
import { markdown } from '../markdown/markdown';
import { format } from '../text/format';
import { isTruthy } from '../utils/isTruthy';
import { prompt } from './prompt';

export const planTasksInputSchema = z
    .object({
        objective: z.string(),
        filePath: z.string(),
        sandboxDirectoryPath: z.string(),
        startCommit: z.string(),
        completedTasks: z.array(z.string()),
        issues: z.array(z.string()),

        llmDependencies: llmDependenciesSchema,
        functionsRepository: functionsRepositorySchema,
    })
    .transform(async (input) => ({
        ...input,
        /**
         * @note result of this task depends on the source code state
         */
        fileDiff: await gitFilesDiff({
            location: input.sandboxDirectoryPath,
            filePaths: [input.filePath],
            ref: input.startCommit,
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
    Think step by step. Be concise and to the point. Do not make assumptions
    other than what was given in the instructions.
`;

const planTasksPromptText = (opts: {
    objective: string;
    filePath: string;
    fileContents: string;
    fileDiff: string;
    completedTasks: string[];
    issues: string[];
}) =>
    format(
        markdown`
            %objective%

            We are now starting the process of refactoring one file at a time.
            Strictly focus only on the file given below.

            Given current contents of the file: \`%filePath%\`:

            ~~~TypeScript
            %fileContents%
            ~~~

            %completedTasks%

            %fileDiff%

            %issues%

            Please produce the task list to accomplish the objective for the
            given file taking into consideration already completed tasks. Return
            one task per line in your response. Each task should be focused only
            on the file mentioned. Try to minimize the total number of tasks.

            The response must be a numbered list in the format:

            #. First task #. Second task

            The number of each entry must be followed by a period. If the list
            of tasks is empty, write "There are no tasks to add at this time"
            and nothing else.

            Unless your list is empty, do not include any headers before your
            numbered list or follow your numbered list with any other output.

            Strictly only list tasks that would result in code changes to the
            file, do not include any other tasks similar or exactly same as
            below:

            1. Open the file.
            2. Execute build and lint scripts to check for errors.
            3. Execute tests for all changed files.
            4. Verify if the objective is complete.
            5. Commit and push to remote repository.
            6. Open a pull request with the changes.
            7. Request a review from the repository owners.
            8. Save the changes to the file.
        `,
        {
            objective: opts.objective,
            filePath: opts.filePath,
            fileContents: opts.fileContents,

            completedTasks:
                opts.completedTasks.length > 0
                    ? markdown`
                        You already have completed the following tasks:

                        ${opts.completedTasks
                            .map((task, index) => `${index + 1}. ${task}`)
                            .join('\n')}
                    `
                    : '',

            fileDiff: opts.fileDiff
                ? markdown`
                    The changes have produced the following diff so far:
                    \`\`\`diff
                    ${opts.fileDiff}
                    \`\`\`
                `
                : '',

            issues:
                opts.issues.length > 0
                    ? markdown`
                        The following issues were found after linting and testing of your changes:

                        ${opts.issues
                            .map((issue, index) => `${index + 1}. ${issue}`)
                            .join('\n')}
                    `
                    : '',
        }
    );

export const planTasks = makeCachedFunction({
    name: 'tasks',
    inputSchema: planTasksInputSchema,
    resultSchema: planTasksResultSchema,
    transform: async (input, ctx): Promise<PlanTasksResponse> => {
        const userPrompt = planTasksPromptText({
            objective: input.objective,
            fileContents: await readFile(
                join(input.sandboxDirectoryPath, input.filePath),
                'utf-8'
            ),
            filePath: input.filePath,
            completedTasks: input.completedTasks,
            fileDiff: input.fileDiff,
            issues: input.issues,
        });

        const { choices } = await prompt(
            {
                ...input,
                preface: systemPrompt,
                prompt: userPrompt,
                temperature: 1,
            },
            ctx
        );

        const tasksRegex = /^\s*\d+\.\s*([^\n]+)\s*/gm;

        return {
            tasks: [...choices[0].resultingMessage.content.matchAll(tasksRegex)]
                .map(([, task]) => task)
                .filter(isTruthy),
        };
    },
});

import { readFile } from 'fs/promises';
import { join } from 'path';
import { z } from 'zod';

import { gitFilesDiff } from '../git/gitFilesDiff';
import { markdown } from '../markdown/markdown';
import { makePipelineFunction } from '../pipeline/makePipelineFunction';
import { isTruthy } from '../utils/isTruthy';
import { makeDependencies } from './dependencies';
import { determineModelParameters } from './determineModelParameters';
import { prompt } from './prompt';
import { refactorConfigSchema } from './types';

export const planTasksInputSchema = refactorConfigSchema
    .pick({
        budgetCents: true,
        model: true,
        modelByStepCode: true,
        useMoreExpensiveModelsOnRetry: true,
    })
    .augment({
        objective: z.string(),
        filePath: z.string(),
        sandboxDirectoryPath: z.string(),
        startCommit: z.string(),
        completedTasks: z.array(z.string()),
        issues: z.array(z.string()),
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
Think step by step. Be concise and to the point. Do not make assumptions other than what was given in the instructions.
`;

const planTasksPromptText = (opts: {
    objective: string;
    filePath: string;
    fileContents: string;
    fileDiff: string;
    completedTasks: string[];
    issues: string[];
}) =>
    markdown`
${opts.objective}

We are now starting the process of refactoring one file at a time. Strictly focus only on the file given below.

Given current contents of the file: \`${opts.filePath}\`:

\`\`\`TypeScript
${opts.fileContents}
\`\`\`

${
    opts.completedTasks.length > 0
        ? `You already have completed the following tasks:

${opts.completedTasks.map((task, index) => `${index + 1}. ${task}`).join('\n')}
`
        : ''
}

${
    opts.fileDiff
        ? `The changes have produced the following diff so far:
\`\`\`diff
${opts.fileDiff}
\`\`\`
`
        : ''
}

${
    opts.issues.length > 0
        ? `The following issues were found after linting and testing of your changes:

${opts.issues.map((issue, index) => `${index + 1}. ${issue}`).join('\n')}
`
        : ''
}

Please produce the task list to accomplish the objective for the given file taking into consideration already completed tasks. Return one task per line in your response. Each task should be focused only on the file mentioned. Try to minimize the total number of tasks. 

The response must be a numbered list in the format:

#. First task
#. Second task

The number of each entry must be followed by a period. If the list of tasks is empty, write "There are no tasks to add at this time" and nothing else.

Unless your list is empty, do not include any headers before your numbered list or follow your numbered list with any other output.

Strictly only list tasks that would result in code changes to the file, do not include any other tasks similar or exactly same as below:

1. Open the file.
2. Execute build and lint scripts to check for errors.
3. Execute tests for all changed files.
4. Verify if the objective is complete.
6. Commit and push to remote repository.
7. Open a pull request with the changes.
8. Request a review from the repository owners.
9. Save the changes to the file.
    `;

export const planTasks = makePipelineFunction({
    name: 'tasks',
    inputSchema: planTasksInputSchema,
    resultSchema: planTasksResultSchema,
    transform: async (
        input,
        persistence,
        getDeps = makeDependencies
    ): Promise<PlanTasksResponse> => {
        const { includeFunctions } = getDeps();

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
                preface: systemPrompt,
                prompt: userPrompt,
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

        const tasksRegex = /^\s*\d+\.\s*([^\n]+)\s*/gm;

        return {
            tasks: [...choices[0].resultingMessage.content.matchAll(tasksRegex)]
                .map(([, task]) => task)
                .filter(isTruthy),
        };
    },
});

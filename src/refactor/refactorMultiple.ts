import { writeFile } from 'fs/promises';
import { join } from 'path';
import { z } from 'zod';

import { gitAdd } from '../git/gitAdd';
import { gitCommit } from '../git/gitCommit';
import { makePipelineFunction } from '../pipeline/makePipelineFunction';
import { executeFileTask } from './executeTask';
import { planTasks } from './planTasks';
import { refactorConfigSchema } from './types';

export const refactorMultipleInputSchema = refactorConfigSchema
    .pick({
        budgetCents: true,
        lintScripts: true,
        testScripts: true,
    })
    .augment({
        enrichedObjective: z.string(),
        plannedFiles: z.array(z.string()),
        defaultBranch: z.string(),
        sandboxDirectoryPath: z.string(),
    });

export const refactorMultipleResultSchema = z.object({
    completedTasks: z.array(z.string()),
    failedTasks: z.array(
        z.object({
            task: z.string(),
            message: z.string(),
        })
    ),
    spentCents: z.number(),
});

export type RefactorMultipleResponse = z.infer<
    typeof refactorMultipleResultSchema
>;

export const refactorMultiple = makePipelineFunction({
    name: 'refactor-multiple',
    inputSchema: refactorMultipleInputSchema,
    resultSchema: refactorMultipleResultSchema,
    transform: async (input, persistence) => {
        const { plannedFiles } = input;

        let spentCents = 0;
        const completedTasks: string[] = [];
        const failedTasks: {
            task: string;
            message: string;
        }[] = [];

        const planTasksWithPersistence = planTasks.withPersistence();
        const executeFileTaskWithPersistence =
            executeFileTask.withPersistence();

        try {
            for (const filePath of plannedFiles) {
                const state = await planTasksWithPersistence.transform(
                    {
                        filePath,
                        budgetCents: input.budgetCents,
                        enrichedObjective: input.enrichedObjective,
                        sandboxDirectoryPath: input.sandboxDirectoryPath,
                    },
                    persistence
                );
                spentCents += state.spentCents;

                for (const task of state.tasks) {
                    try {
                        const result =
                            await executeFileTaskWithPersistence.transform(
                                {
                                    task,
                                    filePath,
                                    completedTasks,
                                    defaultBranch: input.defaultBranch,
                                    sandboxDirectoryPath:
                                        input.sandboxDirectoryPath,
                                    enrichedObjective: input.enrichedObjective,
                                    lintScripts: input.lintScripts,
                                    testScripts: input.testScripts,
                                    budgetCents: input.budgetCents,
                                },
                                persistence
                            );

                        spentCents += result.spentCents;

                        if (result.fileContents) {
                            await writeFile(
                                join(input.sandboxDirectoryPath, filePath),
                                result.fileContents
                            );
                            await gitAdd({
                                location: input.sandboxDirectoryPath,
                                filePath,
                            });
                            await gitCommit({
                                location: input.sandboxDirectoryPath,
                                message: `refactor(${filePath}): ${task}`,
                            });
                        }

                        completedTasks.push(task);
                    } catch (err) {
                        if (err instanceof Error) {
                            failedTasks.push({
                                task,
                                message: err.message,
                            });
                        }
                    }
                }
            }
        } finally {
            if (persistence) {
                await planTasksWithPersistence.clean(persistence);
                await executeFileTaskWithPersistence.clean(persistence);
            }
        }

        return {
            completedTasks,
            failedTasks,
            spentCents,
        };
    },
});

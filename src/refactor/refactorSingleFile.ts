import { writeFile } from 'fs/promises';
import hash from 'object-hash';
import { basename, join } from 'path';
import type { TypeOf } from 'zod';
import { z } from 'zod';

import { gitAdd } from '../git/gitAdd';
import { gitCommit } from '../git/gitCommit';
import { gitFilesDiff } from '../git/gitFilesDiff';
import { gitRevParse } from '../git/gitRevParse';
import { logger } from '../logger/logger';
import { determinePackageManager } from '../package-manager/determinePackageManager';
import { makePipelineFunction } from '../pipeline/makePipelineFunction';
import { lowerCamelCaseToKebabCase } from '../utils/lowerCamelCaseToKebabCase';
import { check } from './check';
import { executeFileTask } from './executeFileTask';
import { planTasks } from './planTasks';
import { refactorConfigSchema } from './types';

export const refactorSingleFileInputSchema = refactorConfigSchema
    .pick({
        budgetCents: true,
        lintScripts: true,
        testScripts: true,
    })
    .augment({
        objective: z.string(),
        filePath: z.string(),
        startCommit: z.string(),
        sandboxDirectoryPath: z.string(),
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

export const refactorTaskResultSchema = z.object({
    task: z.string(),
    status: z.enum(['completed', 'no-changes']),
    fileContents: z.string().optional(),
    commit: z.string().optional(),
});

export const refactorSingleFileResultSchema = z.object({
    tasks: z.array(refactorTaskResultSchema),
});

export type RefactorSingleFileResponse = z.infer<
    typeof refactorSingleFileResultSchema
>;

export const refactorSingleFile = makePipelineFunction({
    name: 'file',
    inputSchema: refactorSingleFileInputSchema,
    resultSchema: refactorSingleFileResultSchema,
    transform: async (input, persistence) => {
        const { filePath, sandboxDirectoryPath } = input;

        const planTasksWithPersistence = planTasks.withPersistence().retry({
            maxAttempts: 3,
        });
        const executeFileTaskWithPersistence = executeFileTask
            .withPersistence()
            .retry({
                maxAttempts: 3,
            });

        const checkWithPersistence = check.withPersistence();

        const scripts = [...input.lintScripts, ...input.testScripts];

        const packageManager = await determinePackageManager({
            directory: input.sandboxDirectoryPath,
        });

        const noChangesTasks: string[] = [];
        const completedTasks: string[] = [];

        const tasksInfo = new Array<TypeOf<typeof refactorTaskResultSchema>>();

        try {
            const fileStartCommit = await gitRevParse({
                location: sandboxDirectoryPath,
                ref: 'HEAD',
            });

            const { tasks } = await planTasksWithPersistence.transform(
                {
                    filePath,
                    budgetCents: input.budgetCents,
                    enrichedObjective: input.objective,
                    sandboxDirectoryPath: input.sandboxDirectoryPath,
                    startCommit: input.startCommit,
                },
                persistence
            );

            while (tasks.length > 0) {
                for (const task of tasks) {
                    const fileDiff = await gitFilesDiff({
                        filePaths: [filePath],
                        location: input.sandboxDirectoryPath,
                        ref: fileStartCommit,
                    });

                    const { issues } =
                        scripts.length > 0
                            ? await checkWithPersistence.transform(
                                  {
                                      packageManager,
                                      location: input.sandboxDirectoryPath,
                                      startCommit: input.startCommit,
                                      filePaths: [filePath],
                                      scripts,
                                  },
                                  persistence
                              )
                            : { issues: [] };

                    const result =
                        await executeFileTaskWithPersistence.transform(
                            {
                                task,
                                filePath,
                                fileDiff,
                                issues,
                                completedTasks,
                                sandboxDirectoryPath:
                                    input.sandboxDirectoryPath,
                                enrichedObjective: input.objective,
                                budgetCents: input.budgetCents,
                            },
                            persistence
                        );

                    if (result.fileContents) {
                        logger.info(
                            'Writing to file at',
                            [filePath],
                            ', with contents hash',
                            [hash(result.fileContents)]
                        );

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
                            message: `refactor(${lowerCamelCaseToKebabCase(
                                basename(filePath, '.ts')
                            )}): ${task}`,
                        });
                        const commit = await gitRevParse({
                            location: input.sandboxDirectoryPath,
                            ref: 'HEAD',
                        });
                        logger.info('Committed', [commit]);

                        tasksInfo.push({
                            status: 'completed',
                            task,
                            fileContents: result.fileContents,
                            commit,
                        });
                    } else {
                        noChangesTasks.push(task);
                    }
                }

                const newTasksResult = await planTasksWithPersistence.transform(
                    {
                        filePath,
                        budgetCents: input.budgetCents,
                        enrichedObjective: input.objective,
                        sandboxDirectoryPath: input.sandboxDirectoryPath,
                        startCommit: input.startCommit,
                    },
                    persistence
                );

                tasks.splice(0, tasks.length - 1, ...newTasksResult.tasks);
            }
        } finally {
            if (persistence) {
                await planTasksWithPersistence.clean(persistence);
                await executeFileTaskWithPersistence.clean(persistence);
                await checkWithPersistence.clean(persistence);
            }
        }

        return {
            tasks: tasksInfo,
        };
    },
});

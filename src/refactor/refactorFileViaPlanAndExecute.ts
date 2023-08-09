import { writeFile } from 'fs/promises';
import { basename, join } from 'path';
import { z } from 'zod';

import { gitAdd } from '../git/gitAdd';
import { gitCommit } from '../git/gitCommit';
import { gitFilesDiff } from '../git/gitFilesDiff';
import { gitRevParse } from '../git/gitRevParse';
import { logger } from '../logger/logger';
import { determinePackageManager } from '../package-manager/determinePackageManager';
import { makePipelineFunction } from '../pipeline/makePipelineFunction';
import { lowerCamelCaseToKebabCase } from '../utils/lowerCamelCaseToKebabCase';
import { analyzeCheckIssuesResults, check } from './check';
import { executeFileTask } from './executeFileTask';
import { planTasks } from './planTasks';
import type { Issue, RefactorStepResult } from './types';
import {
    lastCommit,
    refactorConfigSchema,
    refactorFileResultSchema,
} from './types';

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
        fileDiff: await gitFilesDiff({
            location: input.sandboxDirectoryPath,
            filePaths: [input.filePath],
            ref: input.startCommit,
        }),
    }));

export const refactorFileViaPlanAndExecute = makePipelineFunction({
    name: 'file-pae',
    inputSchema: refactorSingleFileInputSchema,
    resultSchema: refactorFileResultSchema,
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

        const steps = new Array<RefactorStepResult>();

        let issues: Issue[] = [];

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
                    completedTasks: [],
                    issues: [],
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

                    const result =
                        await executeFileTaskWithPersistence.transform(
                            {
                                task,
                                filePath,
                                fileDiff,
                                issues: issues.map((issue) => issue.issue),
                                completedTasks: steps
                                    .filter(
                                        (task) => task.status === 'completed'
                                    )
                                    .map(({ task }) => task),
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
                            [result.fileContentsHash]
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

                        steps.push({
                            status: 'completed',
                            task,
                            fileContents: result.fileContents,
                            commit,
                        });

                        if (scripts.length > 0) {
                            const checkResult =
                                await checkWithPersistence.transform(
                                    {
                                        packageManager,
                                        location: input.sandboxDirectoryPath,
                                        startCommit: input.startCommit,
                                        filePaths: [filePath],
                                        scripts,
                                    },
                                    persistence
                                );

                            const result = analyzeCheckIssuesResults({
                                issues,
                                checkResult,
                            });

                            issues = result.issues;
                        }
                    } else {
                        steps.push({
                            status: 'no-changes',
                            task,
                        });
                    }
                }

                const newTasksResult = await planTasksWithPersistence.transform(
                    {
                        filePath,
                        budgetCents: input.budgetCents,
                        enrichedObjective: input.objective,
                        sandboxDirectoryPath: input.sandboxDirectoryPath,
                        startCommit: input.startCommit,
                        completedTasks: steps
                            .filter((task) => task.status === 'completed')
                            .map(({ task }) => task),
                        issues: issues.map((issue) => issue.issue),
                    },
                    persistence
                );

                tasks.splice(0, tasks.length, ...newTasksResult.tasks);
            }

            if (scripts.length > 0) {
                const checkResult = await checkWithPersistence.transform(
                    {
                        packageManager,
                        location: input.sandboxDirectoryPath,
                        startCommit: input.startCommit,
                        filePaths: [filePath],
                        scripts,
                    },
                    persistence
                );

                const result = analyzeCheckIssuesResults({
                    issues,
                    checkResult,
                });

                issues = result.issues;
            }
        } finally {
            if (persistence) {
                await planTasksWithPersistence.clean(persistence);
                await executeFileTaskWithPersistence.clean(persistence);
                await checkWithPersistence.clean(persistence);
            }
        }

        return {
            filePath,
            issues,
            tasks: steps,
            lastCommit: lastCommit(steps),
        };
    },
});

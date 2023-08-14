import { readFile, writeFile } from 'fs/promises';
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
import { check, checksSummary } from './check';
import { editFilePrompt } from './editFile';
import { planTasks } from './planTasks';
import { executeFileTaskPromptText } from './prompts/executeFileTaskPromptText';
import type { Issue, RefactorStepResult } from './types';
import {
    lastCommit,
    refactorConfigSchema,
    refactorFileResultSchema,
} from './types';

export const refactorFileInputSchema = refactorConfigSchema
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
    inputSchema: refactorFileInputSchema,
    resultSchema: refactorFileResultSchema,
    transform: async (input, persistence) => {
        const { filePath, sandboxDirectoryPath } = input;

        const planTasksWithPersistence = planTasks.withPersistence().retry({
            maxAttempts: 3,
        });
        const executeFileTaskWithPersistence = editFilePrompt
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
                    objective: input.objective,
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

                    const fileContents = await readFile(
                        join(input.sandboxDirectoryPath, filePath),
                        'utf-8'
                    );

                    const result =
                        await executeFileTaskWithPersistence.transform(
                            {
                                objective: executeFileTaskPromptText({
                                    objective: input.objective,
                                    filePath,
                                    fileContents,
                                    task,
                                    completedTasks: steps.map(
                                        ({ task }) => task
                                    ),
                                    issues: issues.map((issue) => issue.issue),
                                    language: 'TypeScript',
                                    fileDiff,
                                }),
                                filePath,
                                sandboxDirectoryPath:
                                    input.sandboxDirectoryPath,
                                fileContents,
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

                            const result = checksSummary({
                                issues,
                                checkResult,
                            });

                            issues = result.issues;
                        }
                    }
                }

                const newTasksResult = await planTasksWithPersistence.transform(
                    {
                        filePath,
                        budgetCents: input.budgetCents,
                        objective: input.objective,
                        sandboxDirectoryPath: input.sandboxDirectoryPath,
                        startCommit: input.startCommit,
                        completedTasks: steps.map(({ task }) => task),
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

                const result = checksSummary({
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
            status: 'success' as const,
            filePath,
            issues,
            steps,
            lastCommit: lastCommit(steps),
        };
    },
});

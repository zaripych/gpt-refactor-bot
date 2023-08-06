import { writeFile } from 'fs/promises';
import hash from 'object-hash';
import { join } from 'path';
import { z } from 'zod';

import { gitAdd } from '../git/gitAdd';
import { gitCommit } from '../git/gitCommit';
import { gitResetHard } from '../git/gitResetHard';
import { gitRevParse } from '../git/gitRevParse';
import { gitStatus } from '../git/gitStatus';
import { logger } from '../logger/logger';
import { makePipelineFunction } from '../pipeline/makePipelineFunction';
import { executeFileTask } from './executeFileTask';
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
        startCommit: z.string(),
    });

export const refactorMultipleResultSchema = z.object({});

export type RefactorMultipleResponse = z.infer<
    typeof refactorMultipleResultSchema
>;

export const refactorMultiple = makePipelineFunction({
    name: 'refactor-multiple',
    inputSchema: refactorMultipleInputSchema,
    resultSchema: refactorMultipleResultSchema,
    transform: async (input, persistence) => {
        const { plannedFiles, sandboxDirectoryPath } = input;

        const currentCommit = await gitRevParse({
            location: sandboxDirectoryPath,
            ref: 'HEAD',
        });
        const status = await gitStatus({
            location: sandboxDirectoryPath,
        });

        if (
            currentCommit !== input.startCommit ||
            Object.values(status).length > 0
        ) {
            /**
             * @note we get here when the refactor is run again after a failure
             * or when the user made changes to the sandbox directory
             */
            logger.info('Resetting to start commit', input.startCommit);
            await gitResetHard({
                location: sandboxDirectoryPath,
                ref: input.startCommit,
            });
        }

        const planTasksWithPersistence = planTasks.withPersistence().retry({
            maxAttempts: 3,
        });
        const executeFileTaskWithPersistence = executeFileTask
            .withPersistence()
            .retry({
                maxAttempts: 3,
            });

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

                const completedTasks: string[] = [];

                for (const task of state.tasks) {
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

                    if (result.fileContents) {
                        logger.info('Last commit', [
                            await gitRevParse({
                                location: input.sandboxDirectoryPath,
                                ref: 'HEAD',
                            }),
                        ]);
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
                            message: `refactor(${filePath}): ${task}`,
                        });
                        logger.info('Committed', [
                            await gitRevParse({
                                location: input.sandboxDirectoryPath,
                                ref: 'HEAD',
                            }),
                        ]);
                    }

                    completedTasks.push(task);
                }
            }
        } finally {
            if (persistence) {
                await planTasksWithPersistence.clean(persistence);
                await executeFileTaskWithPersistence.clean(persistence);
            }
        }

        return {};
    },
});

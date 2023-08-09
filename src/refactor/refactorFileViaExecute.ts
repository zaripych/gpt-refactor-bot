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

export const refactorFileViaExecute = makePipelineFunction({
    name: 'file-wp',
    inputSchema: refactorSingleFileInputSchema,
    resultSchema: refactorFileResultSchema,
    transform: async (input, persistence) => {
        const { filePath } = input;

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

        const issues: Issue[] = [];

        try {
            do {
                const task =
                    issues.length > 0
                        ? `Resolve all compilation and lint issues`
                        : `Perform modifications to the file according to the goal`;

                const result = await executeFileTaskWithPersistence.transform(
                    {
                        task,
                        ...(issues.length > 0 && {
                            issues: issues.map(({ issue }) => issue),
                        }),
                        filePath,
                        sandboxDirectoryPath: input.sandboxDirectoryPath,
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

                        if (result.resolvedIssues.length > 0) {
                            logger.info(
                                `The change has resolved ${result.resolvedIssues.length} issues`
                            );
                        }
                        if (result.newIssues.length > 0) {
                            logger.info(
                                `The change has introduced ${result.newIssues.length} issues`
                            );
                        }
                        issues.splice(0, issues.length, ...result.issues);
                    }
                } else {
                    steps.push({
                        status: 'no-changes',
                        task,
                    });
                }
            } while (issues.length > 0);
        } finally {
            if (persistence) {
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

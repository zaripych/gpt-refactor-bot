import { z } from 'zod';

import { gitResetHard } from '../git/gitResetHard';
import { gitRevParse } from '../git/gitRevParse';
import { gitStatus } from '../git/gitStatus';
import { logger } from '../logger/logger';
import { makePipelineFunction } from '../pipeline/makePipelineFunction';
import { fixIssues } from './fixIssues';
import type { RefactorFilesResult } from './refactorMultipleFiles';
import { mergeRefactorFilesResults } from './refactorMultipleFiles';
import { refactorObjective } from './refactorObjective';
import { refactorTaskResultSchema } from './refactorSingleFile';
import { refactorConfigSchema } from './types';

export const refactorGoalInputSchema = refactorConfigSchema
    .pick({
        budgetCents: true,
        lintScripts: true,
        testScripts: true,
    })
    .augment({
        objective: z.string(),
        enrichedObjective: z.string(),
        sandboxDirectoryPath: z.string(),
        startCommit: z.string(),
    });

export const refactorGoalResultSchema = z.object({
    files: z.record(z.string(), z.array(refactorTaskResultSchema)),
});

export type RefactorGoalResponse = z.infer<typeof refactorGoalResultSchema>;

export const refactorGoal = makePipelineFunction({
    name: 'goal',
    inputSchema: refactorGoalInputSchema,
    resultSchema: refactorGoalResultSchema,
    transform: async (input, persistence) => {
        const { sandboxDirectoryPath } = input;

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

        const refactorObjectiveWithPersistence =
            refactorObjective.withPersistence();
        const fixIssuesWithPersistence = fixIssues.withPersistence();

        const files: RefactorFilesResult = {};

        try {
            /**
             * @note here we perform all tasks necessary to accomplish the
             * original goal
             */
            const initialResult =
                await refactorObjectiveWithPersistence.transform(
                    {
                        objective: input.enrichedObjective,
                        startCommit: input.startCommit,
                        sandboxDirectoryPath: input.sandboxDirectoryPath,
                        budgetCents: input.budgetCents,
                        lintScripts: input.lintScripts,
                        testScripts: input.testScripts,
                    },
                    persistence
                );

            mergeRefactorFilesResults({
                from: initialResult.files,
                into: files,
            });

            /**
             * @note here we focus on making the project pass linting
             * and testing so that a pull request can be created
             */
            const fixResult = await fixIssuesWithPersistence.transform(
                {
                    objective: input.objective,
                    startCommit: input.startCommit,
                    changedFiles: Object.keys(files),
                    sandboxDirectoryPath: input.sandboxDirectoryPath,
                    budgetCents: input.budgetCents,
                    lintScripts: input.lintScripts,
                    testScripts: input.testScripts,
                },
                persistence
            );

            mergeRefactorFilesResults({
                from: fixResult.files,
                into: files,
            });
        } finally {
            if (persistence) {
                await refactorObjectiveWithPersistence.clean(persistence);
                await fixIssuesWithPersistence.clean(persistence);
            }
        }

        return {
            files,
        };
    },
});

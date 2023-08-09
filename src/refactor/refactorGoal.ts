import { z } from 'zod';

import { gitResetHard } from '../git/gitResetHard';
import { gitRevParse } from '../git/gitRevParse';
import { gitStatus } from '../git/gitStatus';
import { logger } from '../logger/logger';
import { makePipelineFunction } from '../pipeline/makePipelineFunction';
import type { RefactorFilesResult } from './refactorMultipleFiles';
import { refactorObjective } from './refactorObjective';
import {
    mergeRefactorFilesResults,
    refactorConfigSchema,
    refactorStepResultSchema,
} from './types';

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
    files: z.record(z.string(), z.array(refactorStepResultSchema)),
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

        const files: RefactorFilesResult = {};

        try {
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
        } finally {
            if (persistence) {
                await refactorObjectiveWithPersistence.clean(persistence);
            }
        }

        return {
            files,
        };
    },
});

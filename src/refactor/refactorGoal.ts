import { z } from 'zod';

import { gitResetHard } from '../git/gitResetHard';
import { gitRevParse } from '../git/gitRevParse';
import { gitStatus } from '../git/gitStatus';
import { logger } from '../logger/logger';
import { makePipelineFunction } from '../pipeline/makePipelineFunction';
import type { RefactorFilesResult } from './refactorBatchAcceptAll';
import { refactorObjective } from './refactorObjective';
import {
    mergeRefactorFilesResults,
    refactorConfigSchema,
    refactorStepResultSchema,
} from './types';

export const refactorGoalInputSchema = refactorConfigSchema.augment({
    objective: z.string(),
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
                    input,
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

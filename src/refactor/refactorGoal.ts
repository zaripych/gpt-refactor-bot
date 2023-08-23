import { z } from 'zod';

import { gitResetHard } from '../git/gitResetHard';
import { gitRevParse } from '../git/gitRevParse';
import { gitStatus } from '../git/gitStatus';
import { logger } from '../logger/logger';
import { makePipelineFunction } from '../pipeline/makePipelineFunction';
import { planAndRefactor } from './refactorObjective';
import type { RefactorFilesResult } from './types';
import {
    mutateToMergeRefactorFilesResults,
    refactorConfigSchema,
    refactorFilesResultSchema,
} from './types';

export const refactorGoalInputSchema = refactorConfigSchema.augment({
    objective: z.string(),
    sandboxDirectoryPath: z.string(),
    startCommit: z.string(),
});

export const refactorGoal = makePipelineFunction({
    name: 'goal',
    inputSchema: refactorGoalInputSchema,
    resultSchema: refactorFilesResultSchema,
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

        const planAndRefactorWithPersistence =
            planAndRefactor.withPersistence();

        const files: RefactorFilesResult = {
            accepted: {},
            discarded: {},
        };

        try {
            const result = await planAndRefactorWithPersistence.transform(
                input,
                persistence
            );

            mutateToMergeRefactorFilesResults({
                from: result,
                into: files,
            });
        } finally {
            if (persistence) {
                await planAndRefactorWithPersistence.clean(persistence);
            }
        }

        return files;
    },
});

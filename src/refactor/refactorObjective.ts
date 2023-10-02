import { z } from 'zod';

import { CycleDetectedError } from '../errors/cycleDetectedError';
import { logger } from '../logger/logger';
import { makePipelineFunction } from '../pipeline/makePipelineFunction';
import { scriptSchema } from './check';
import { planFiles, planFilesResultSchema } from './planFiles';
import { refactorBatch } from './refactorBatch';
import type { RefactorFilesResult } from './types';
import {
    mutateToMergeRefactorFilesResults,
    refactorConfigSchema,
    refactorFilesResultSchema,
} from './types';

export const planAndRefactorInputSchema = refactorConfigSchema.augment({
    objective: z.string(),
    startCommit: z.string(),
    sandboxDirectoryPath: z.string(),
    scripts: z.array(scriptSchema),
});

export const planAndRefactorResultSchema = refactorFilesResultSchema.merge(
    z.object({
        planning: z.array(planFilesResultSchema),
    })
);

export const planAndRefactor = makePipelineFunction({
    name: 'objective',
    inputSchema: planAndRefactorInputSchema,
    resultSchema: planAndRefactorResultSchema,
    transform: async (input, persistence) => {
        const planFilesWithPersistence = planFiles.withPersistence().retry({
            maxAttempts: 3,
        });

        const files: RefactorFilesResult = {
            accepted: {},
            discarded: {},
        };

        const planning: Array<z.output<typeof planFilesResultSchema>> = [];

        try {
            const planResult = await planFilesWithPersistence.transform(
                input,
                persistence
            );

            planning.push(planResult);

            const { plannedFiles } = planResult;

            while (plannedFiles.length > 0) {
                const result = await refactorBatch(
                    {
                        plannedFiles,
                        ...input,
                    },
                    persistence
                );

                mutateToMergeRefactorFilesResults({
                    from: result,
                    into: files,
                });

                const repeatedPlanResult = await planFilesWithPersistence
                    .transform(input, persistence)
                    .catch((err) => {
                        if (err instanceof CycleDetectedError) {
                            /**
                             * @note Ideally the planFiles function would
                             * be able to detect this and return an empty
                             * list instead.
                             */
                            logger.warn(
                                'Cycle detected when planning files to change, this is likely result of the last batch of changes not producing any changes.',
                                {
                                    error: err,
                                    result,
                                }
                            );
                            return {
                                plannedFiles: [],
                            };
                        }
                        return Promise.reject(err);
                    });

                plannedFiles.splice(
                    0,
                    plannedFiles.length,
                    ...repeatedPlanResult.plannedFiles
                );

                planning.push(repeatedPlanResult);
            }
        } finally {
            if (persistence) {
                await planFilesWithPersistence.clean(persistence);
            }
        }

        return {
            ...files,
            planning,
        };
    },
});

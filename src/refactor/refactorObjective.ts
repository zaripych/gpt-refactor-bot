import type { TypeOf } from 'zod';
import { z } from 'zod';

import { makePipelineFunction } from '../pipeline/makePipelineFunction';
import { planFiles } from './planFiles';
import { refactorBatchAcceptAll } from './refactorBatchAcceptAll';
import {
    mergeRefactorFilesResults,
    refactorConfigSchema,
    refactorStepResultSchema,
} from './types';

export const refactorObjectiveInputSchema = refactorConfigSchema.augment({
    objective: z.string(),
    startCommit: z.string(),
    sandboxDirectoryPath: z.string(),
});

export const refactorObjectiveResultSchema = z.object({
    files: z.record(z.string(), z.array(refactorStepResultSchema)),
});

export type RefactorObjectiveResponse = z.infer<
    typeof refactorObjectiveResultSchema
>;

export const refactorObjective = makePipelineFunction({
    name: 'objective',
    inputSchema: refactorObjectiveInputSchema,
    resultSchema: refactorObjectiveResultSchema,
    transform: async (input, persistence) => {
        const planFilesWithPersistence = planFiles.withPersistence().retry({
            maxAttempts: 3,
        });
        const files: Record<
            string,
            Array<TypeOf<typeof refactorStepResultSchema>>
        > = {};

        try {
            const { plannedFiles } = await planFilesWithPersistence.transform(
                input,
                persistence
            );

            while (plannedFiles.length > 0) {
                const result = await refactorBatchAcceptAll.transform(
                    {
                        plannedFiles,
                        ...input,
                    },
                    persistence
                );

                mergeRefactorFilesResults({
                    from: result.files,
                    into: files,
                });

                const repeatedPlanResult =
                    await planFilesWithPersistence.transform(
                        input,
                        persistence
                    );

                plannedFiles.splice(
                    0,
                    planFiles.length,
                    ...repeatedPlanResult.plannedFiles
                );
            }
        } finally {
            if (persistence) {
                await planFilesWithPersistence.clean(persistence);
            }
        }

        return {
            files,
        };
    },
});

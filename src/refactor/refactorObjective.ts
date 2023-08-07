import type { TypeOf } from 'zod';
import { z } from 'zod';

import { makePipelineFunction } from '../pipeline/makePipelineFunction';
import { planFiles } from './planFiles';
import {
    mergeRefactorFilesResults,
    refactorMultipleFiles,
} from './refactorMultipleFiles';
import { refactorTaskResultSchema } from './refactorSingleFile';
import { refactorConfigSchema } from './types';

export const refactorObjectiveInputSchema = refactorConfigSchema
    .pick({
        budgetCents: true,
        lintScripts: true,
        testScripts: true,
    })
    .augment({
        objective: z.string(),
        startCommit: z.string(),
        sandboxDirectoryPath: z.string(),
    });

export const refactorObjectiveResultSchema = z.object({
    files: z.record(z.string(), z.array(refactorTaskResultSchema)),
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
            Array<TypeOf<typeof refactorTaskResultSchema>>
        > = {};

        try {
            const { plannedFiles } = await planFilesWithPersistence.transform(
                {
                    objective: input.objective,
                    sandboxDirectoryPath: input.sandboxDirectoryPath,
                    budgetCents: input.budgetCents,
                    startCommit: input.startCommit,
                },
                persistence
            );

            while (plannedFiles.length > 0) {
                const result = await refactorMultipleFiles.transform(
                    {
                        objective: input.objective,
                        plannedFiles,
                        startCommit: input.startCommit,
                        sandboxDirectoryPath: input.sandboxDirectoryPath,
                        budgetCents: input.budgetCents,
                        lintScripts: input.lintScripts,
                        testScripts: input.testScripts,
                    },
                    persistence
                );

                mergeRefactorFilesResults({
                    from: result.files,
                    into: files,
                });

                const repeatedPlanResult =
                    await planFilesWithPersistence.transform(
                        {
                            objective: input.objective,
                            sandboxDirectoryPath: input.sandboxDirectoryPath,
                            budgetCents: input.budgetCents,
                            startCommit: input.startCommit,
                        },
                        persistence
                    );

                plannedFiles.splice(
                    0,
                    planFiles.length - 1,
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

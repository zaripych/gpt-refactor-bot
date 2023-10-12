import { z } from 'zod';

import { CycleDetectedError } from '../errors/cycleDetectedError';
import { logger } from '../logger/logger';
import { makePipelineFunction } from '../pipeline/makePipelineFunction';
import { scriptSchema } from './check';
import { planFiles, planFilesResultSchema } from './planFiles';
import { refactorBatch } from './refactorBatch';
import { resetToLastAcceptedCommit } from './resetToLastAcceptedCommit';
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
    filesToEdit: z.array(z.string()),
});

export const planAndRefactorResultSchema = refactorFilesResultSchema.merge(
    z.object({
        planning: z.array(planFilesResultSchema),
    })
);

export const planAndRefactor = makePipelineFunction({
    name: 'plan-and-refactor',
    inputSchema: planAndRefactorInputSchema,
    resultSchema: planAndRefactorResultSchema,
    transform: async (input, persistence) => {
        const files: RefactorFilesResult = {
            accepted: {},
            discarded: {},
        };

        const planning: Array<z.output<typeof planFilesResultSchema>> = [];

        const planResult = await planFiles(input, persistence);

        planning.push({
            plannedFiles: [...planResult.plannedFiles],
            ...('reasoning' in planResult && {
                reasoning: planResult.reasoning,
            }),
        });

        const { plannedFiles } = planResult;

        while (plannedFiles.length > 0) {
            const result = await refactorBatch(
                {
                    plannedFiles,
                    ...input,
                },
                persistence
            );

            await resetToLastAcceptedCommit({
                location: input.sandboxDirectoryPath,
                result,
            });

            mutateToMergeRefactorFilesResults({
                from: result,
                into: files,
            });

            const repeatedPlanResult = await planFiles(
                input,
                persistence
            ).catch((err) => {
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

            planning.push({
                plannedFiles: [...repeatedPlanResult.plannedFiles],
                ...('reasoning' in repeatedPlanResult && {
                    reasoning: repeatedPlanResult.reasoning,
                }),
            });
        }

        return {
            ...files,
            planning,
        };
    },
});

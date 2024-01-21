import { z } from 'zod';

import { CycleDetectedError } from '../errors/cycleDetectedError';
import { logger } from '../logger/logger';
import { line } from '../text/line';
import { scriptSchema } from './check';
import { planFiles, planFilesResultSchema } from './planFiles';
import { refactorBatch } from './refactorBatch';
import { resetToLastAcceptedCommit } from './resetToLastAcceptedCommit';
import type { RefactorFilesResult } from './types';
import { refactorConfigSchema, refactorFilesResultSchema } from './types';

export const planAndRefactorInputSchema = refactorConfigSchema.augment({
    objective: z.string(),
    requirements: z.array(z.string()).nonempty(),
    startCommit: z.string(),
    sandboxDirectoryPath: z.string(),
    scripts: z.array(scriptSchema),
    prettierScriptLocation: z.string().optional(),
    filesToEdit: z.array(z.string()),
});

export const planAndRefactorResultSchema = refactorFilesResultSchema.merge(
    z.object({
        planFilesResults: z.array(planFilesResultSchema),
    })
);

export const planAndRefactor = async (
    input: z.input<typeof planAndRefactorInputSchema>
) => {
    const files: RefactorFilesResult = {
        accepted: [],
        discarded: [],
    };

    const planFilesResults: Array<z.output<typeof planFilesResultSchema>> = [];

    const planResult = await planFiles(input);

    planFilesResults.push({
        plannedFiles: [...planResult.plannedFiles],
        rawResponse: planResult.rawResponse,
    });

    const plannedFiles = [...planResult.plannedFiles];

    while (plannedFiles.length > 0) {
        const result = await refactorBatch({
            plannedFiles,
            ...input,
        });

        await resetToLastAcceptedCommit({
            location: input.sandboxDirectoryPath,
            result,
        });

        files.accepted.push(...result.accepted);
        files.discarded.push(...result.discarded);

        const repeatedPlanResult = await planFiles(input).catch((err) => {
            if (err instanceof CycleDetectedError) {
                /**
                 * @note Ideally the planFiles function would
                 * be able to detect this and return an empty
                 * list instead.
                 */
                logger.warn(
                    line`
                        Cycle detected when planning files to change, this is
                        likely result of the last batch of file edits not
                        producing any changes
                    `,
                    {
                        error: err,
                        result,
                    }
                );
                return {
                    plannedFiles: [],
                    rawResponse: '',
                };
            }
            return Promise.reject(err);
        });

        plannedFiles.splice(
            0,
            plannedFiles.length,
            ...repeatedPlanResult.plannedFiles
        );

        planFilesResults.push({
            plannedFiles: [...repeatedPlanResult.plannedFiles],
            rawResponse: repeatedPlanResult.rawResponse,
        });
    }

    return {
        ...files,
        planFilesResults,
    };
};

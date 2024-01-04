import { z } from 'zod';

import { AbortError } from '../errors/abortError';
import { CycleDetectedError } from '../errors/cycleDetectedError';
import { OutOfContextBoundsError } from '../errors/outOfContextBoundsError';
import { dispatch } from '../event-bus';
import { gitResetHard } from '../git/gitResetHard';
import { gitRevParse } from '../git/gitRevParse';
import { logger } from '../logger/logger';
import { acceptedEdit } from './actions/acceptedEdit';
import { discardedEdit } from './actions/discardedEdit';
import { scriptSchema } from './check';
import { refactorFile } from './refactorFile';
import type { RefactorFileResult, RefactorFilesResult } from './types';
import {
    pushRefactorFileResults,
    refactorConfigSchema,
    refactorResultSchema,
} from './types';

export const refactorBatchInputSchema = refactorConfigSchema
    .pick({
        budgetCents: true,
        lintScripts: true,
        testScripts: true,
        model: true,
        modelByStepCode: true,
        useMoreExpensiveModelsOnRetry: true,
        allowedFunctions: true,
    })
    .augment({
        objective: z.string(),
        plannedFiles: z.array(z.string()),
        startCommit: z.string(),
        sandboxDirectoryPath: z.string(),
        /**
         * Controls whether to accept the result of a refactor or not.
         */
        shouldAcceptResult: z
            .function(
                z.tuple([refactorResultSchema]),
                z.promise(z.boolean()).or(z.boolean())
            )
            .optional(),
        scripts: z.array(scriptSchema),
    });

export const refactorBatch = async (
    input: z.input<typeof refactorBatchInputSchema>,
    deps = { dispatch }
) => {
    const { plannedFiles } = await refactorBatchInputSchema.parseAsync(input);

    const shouldAcceptResult =
        input.shouldAcceptResult ??
        ((result) => result.status === 'success' && Boolean(result.lastCommit));

    const accepted: RefactorFilesResult['accepted'] = {};
    const discarded: RefactorFilesResult['discarded'] = {};

    for (const filePath of plannedFiles) {
        const beforeRefactorCommit = await gitRevParse({
            location: input.sandboxDirectoryPath,
            ref: 'HEAD',
        });

        const { file } = await refactorFile({
            filePath,
            ...input,
        }).catch((err) => {
            if (
                err instanceof AbortError &&
                !(err instanceof CycleDetectedError) &&
                !(err instanceof OutOfContextBoundsError)
            ) {
                return Promise.reject(err);
            }

            /**
             * @note this is temporary, ideally the refactorFile
             * function should not throw and return a failure result
             */
            return {
                file: {
                    status: 'failure',
                    failureDescription:
                        err instanceof Error ? err.message : String(err),
                    filePath,
                    issues: [],
                    steps: [],
                    timestamp: performance.now(),
                },
            } as RefactorFileResult;
        });

        const shouldAccept = await Promise.resolve(shouldAcceptResult(file));

        if (shouldAccept) {
            if (file.lastCommit) {
                const currentCommit = await gitRevParse({
                    location: input.sandboxDirectoryPath,
                    ref: 'HEAD',
                });

                if (currentCommit !== file.lastCommit) {
                    logger.info('Resetting to', file.lastCommit);

                    await gitResetHard({
                        location: input.sandboxDirectoryPath,
                        ref: file.lastCommit,
                    });
                }
            }
            pushRefactorFileResults({
                into: accepted,
                result: file,
            });

            deps.dispatch(acceptedEdit(file));
        } else {
            const currentCommit = await gitRevParse({
                location: input.sandboxDirectoryPath,
                ref: 'HEAD',
            });

            if (currentCommit !== beforeRefactorCommit) {
                logger.warn(
                    'Resetting to previous commit',
                    beforeRefactorCommit
                );

                await gitResetHard({
                    location: input.sandboxDirectoryPath,
                    ref: beforeRefactorCommit,
                });
            }

            if (file.status === 'failure') {
                pushRefactorFileResults({
                    into: discarded,
                    result: file,
                });
            }

            deps.dispatch(discardedEdit(file));
        }
    }

    return {
        accepted,
        discarded,
    };
};

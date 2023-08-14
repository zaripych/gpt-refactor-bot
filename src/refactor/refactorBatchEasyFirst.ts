import type { TypeOf } from 'zod';
import { z } from 'zod';

import { AbortError } from '../errors/abortError';
import { gitResetHard } from '../git/gitResetHard';
import { gitRevParse } from '../git/gitRevParse';
import { logger } from '../logger/logger';
import { makePipelineFunction } from '../pipeline/makePipelineFunction';
import { refactorFileUntilChecksPass } from './refactorFileUntilChecksPass';
import type { RefactorResult } from './types';
import { refactorConfigSchema, refactorStepResultSchema } from './types';

export const refactorBatchInputSchema = refactorConfigSchema
    .pick({
        budgetCents: true,
        lintScripts: true,
        testScripts: true,
        model: true,
        modelByStepCode: true,
        useMoreExpensiveModelsOnRetry: true,
    })
    .augment({
        objective: z.string(),
        plannedFiles: z.array(z.string()),
        startCommit: z.string(),
        sandboxDirectoryPath: z.string(),
    });

export const refactorBatchResultSchema = z.object({
    files: z.record(z.string(), z.array(refactorStepResultSchema)),
});

export type RefactorFilesResult = Record<
    string,
    Array<TypeOf<typeof refactorStepResultSchema>>
>;

export type RefactorMultipleFilesResponse = z.infer<
    typeof refactorBatchResultSchema
>;

export const refactorBatchEasyFirst = makePipelineFunction({
    name: 'easy-first',
    inputSchema: refactorBatchInputSchema,
    resultSchema: refactorBatchResultSchema,
    transform: async (input, persistence) => {
        const { plannedFiles } = input;

        const refactorFile = refactorFileUntilChecksPass.withPersistence();

        const files: RefactorResult['files'] = {};

        try {
            await gitResetHard({
                location: input.sandboxDirectoryPath,
                ref: input.startCommit,
            });

            for (const filePath of plannedFiles) {
                const commitBeforeStartingOnFile = await gitRevParse({
                    location: input.sandboxDirectoryPath,
                    ref: 'HEAD',
                });

                const fileResult = await refactorFile.transform(
                    {
                        filePath,
                        ...input,
                    },
                    persistence
                );

                if (fileResult.status === 'success') {
                    if (fileResult.lastCommit) {
                        const currentCommit = await gitRevParse({
                            location: input.sandboxDirectoryPath,
                            ref: 'HEAD',
                        });

                        if (currentCommit !== fileResult.lastCommit) {
                            logger.log('Resetting to', [fileResult.lastCommit]);
                            await gitResetHard({
                                location: input.sandboxDirectoryPath,
                                ref: fileResult.lastCommit,
                            });
                        }
                    }

                    files[filePath] = fileResult.steps;
                } else {
                    await gitResetHard({
                        location: input.sandboxDirectoryPath,
                        ref: commitBeforeStartingOnFile,
                    });
                }

                throw new AbortError('Stop for now');
            }
        } finally {
            if (persistence) {
                await refactorFile.clean(persistence);
            }
        }

        return {
            files,
        };
    },
});

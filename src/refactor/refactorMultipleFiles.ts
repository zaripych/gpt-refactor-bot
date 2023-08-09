import type { TypeOf } from 'zod';
import { z } from 'zod';

import { gitResetHard } from '../git/gitResetHard';
import { gitRevParse } from '../git/gitRevParse';
import { logger } from '../logger/logger';
import { makePipelineFunction } from '../pipeline/makePipelineFunction';
import { refactorFileViaExecute } from './refactorFileViaExecute';
import type { RefactorResult } from './types';
import { refactorConfigSchema, refactorStepResultSchema } from './types';

export const refactorMultipleFilesInputSchema = refactorConfigSchema
    .pick({
        budgetCents: true,
        lintScripts: true,
        testScripts: true,
    })
    .augment({
        objective: z.string(),
        plannedFiles: z.array(z.string()),
        startCommit: z.string(),
        sandboxDirectoryPath: z.string(),
    });

export const refactorMultipleFilesResultSchema = z.object({
    files: z.record(z.string(), z.array(refactorStepResultSchema)),
});

export type RefactorFilesResult = Record<
    string,
    Array<TypeOf<typeof refactorStepResultSchema>>
>;

export type RefactorMultipleFilesResponse = z.infer<
    typeof refactorMultipleFilesResultSchema
>;

export const refactorMultipleFiles = makePipelineFunction({
    name: 'refactor-multiple-files',
    inputSchema: refactorMultipleFilesInputSchema,
    resultSchema: refactorMultipleFilesResultSchema,
    transform: async (input, persistence) => {
        const { plannedFiles } = input;

        const refactorFile = refactorFileViaExecute.withPersistence();

        const files: RefactorResult['files'] = {};

        try {
            for (const filePath of plannedFiles) {
                const { tasks, lastCommit } = await refactorFile.transform(
                    {
                        filePath,
                        startCommit: input.startCommit,
                        objective: input.objective,
                        sandboxDirectoryPath: input.sandboxDirectoryPath,
                        budgetCents: input.budgetCents,
                        lintScripts: input.lintScripts,
                        testScripts: input.testScripts,
                    },
                    persistence
                );

                if (lastCommit) {
                    const currentCommit = await gitRevParse({
                        location: input.sandboxDirectoryPath,
                        ref: 'HEAD',
                    });

                    if (currentCommit !== lastCommit) {
                        logger.log('Resetting to', [lastCommit]);
                        await gitResetHard({
                            location: input.sandboxDirectoryPath,
                            ref: lastCommit,
                        });
                    }
                }

                files[filePath] = tasks;
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

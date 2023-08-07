import type { TypeOf } from 'zod';
import { z } from 'zod';

import { makePipelineFunction } from '../pipeline/makePipelineFunction';
import {
    refactorSingleFile,
    refactorTaskResultSchema,
} from './refactorSingleFile';
import { refactorConfigSchema } from './types';

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
    files: z.record(z.string(), z.array(refactorTaskResultSchema)),
});

export type RefactorFilesResult = Record<
    string,
    Array<TypeOf<typeof refactorTaskResultSchema>>
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

        const refactorSingleFileWithPersistence =
            refactorSingleFile.withPersistence();

        const files: Record<
            string,
            Array<TypeOf<typeof refactorTaskResultSchema>>
        > = {};

        try {
            for (const filePath of plannedFiles) {
                const { tasks } =
                    await refactorSingleFileWithPersistence.transform(
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

                files[filePath] = tasks;
            }
        } finally {
            if (persistence) {
                await refactorSingleFileWithPersistence.clean(persistence);
            }
        }

        return {
            files,
        };
    },
});

export const mergeRefactorFilesResults = (opts: {
    from: RefactorFilesResult;
    into: RefactorFilesResult;
}) => {
    for (const [file, tasks] of Object.entries(opts.from)) {
        const existing = opts.into[file];
        if (existing) {
            opts.into[file] = existing.concat(tasks);
        } else {
            opts.into[file] = tasks;
        }
    }
};

export const mergedRefactorFilesResults = (
    a: RefactorFilesResult,
    b: RefactorFilesResult
) => {
    const files: RefactorFilesResult = { ...a };
    mergeRefactorFilesResults({
        from: b,
        into: files,
    });
    return files;
};

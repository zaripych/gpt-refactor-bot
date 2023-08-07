import { z } from 'zod';

import { diffHash } from '../git/diffHash';
import { filesDiffHash } from '../git/filesDiffHash';
import { markdown } from '../markdown/markdown';
import { determinePackageManager } from '../package-manager/determinePackageManager';
import { makePipelineFunction } from '../pipeline/makePipelineFunction';
import { check } from './check';
import type { RefactorFilesResult } from './refactorMultipleFiles';
import { mergeRefactorFilesResults } from './refactorMultipleFiles';
import { refactorObjective } from './refactorObjective';
import { refactorTaskResultSchema } from './refactorSingleFile';
import { refactorConfigSchema } from './types';

export const fixIssuesInputSchema = refactorConfigSchema
    .pick({
        budgetCents: true,
        lintScripts: true,
        testScripts: true,
    })
    .augment({
        objective: z.string(),
        sandboxDirectoryPath: z.string(),
        startCommit: z.string(),
        changedFiles: z.array(z.string()).optional(),
    })
    .transform(async (input) => ({
        ...input,
        /**
         * @note result of this task depends on the source code state
         */
        ...(input.changedFiles
            ? await filesDiffHash({
                  location: input.sandboxDirectoryPath,
                  ref: input.startCommit,
                  filePaths: input.changedFiles,
              })
            : await diffHash({
                  location: input.sandboxDirectoryPath,
                  ref: input.startCommit,
              })),
    }));

export const fixIssuesResultSchema = z.object({
    files: z.record(z.string(), z.array(refactorTaskResultSchema)),
});

export type FixIssuesResponse = z.infer<typeof fixIssuesResultSchema>;

const fixIssuesPromptText = (opts: {
    objective: string;
    changedFiles: string[];
    issues: string[];
    language: string;
}) =>
    markdown`
${opts.objective}

${
    opts.changedFiles.length > 0
        ? `You've just completed refactoring to accomplish the above objective. Following files have been modified:

${opts.changedFiles
    .map((file, index) => `${index + 1}. \`${file}\``)
    .join('\n')}

`
        : ''
}The following issues were found after linting and testing of your changes:

${opts.issues.map((issue, index) => `${index + 1}. ${issue}`).join('\n')}

The goal now is to fix all the issues you have introduced preferably without introducing new issues. 
`;

export const fixIssues = makePipelineFunction({
    name: 'issues',
    inputSchema: fixIssuesInputSchema,
    resultSchema: fixIssuesResultSchema,
    transform: async (input, persistence) => {
        const scripts = [...input.lintScripts, ...input.testScripts];

        const refactorObjectiveWithPersistence =
            refactorObjective.withPersistence();
        const checkWithPersistence = check.withPersistence();

        const files: RefactorFilesResult = {};

        const getChangedFiles = () => [
            ...new Set((input.changedFiles ?? []).concat(Object.keys(files))),
        ];

        const checkParams = {
            startCommit: input.startCommit,
            location: input.sandboxDirectoryPath,
            packageManager: await determinePackageManager({
                directory: input.sandboxDirectoryPath,
            }),
            scripts,
        };

        try {
            let changedFiles = getChangedFiles();
            const { issues } =
                scripts.length > 0
                    ? await checkWithPersistence.transform(
                          {
                              ...checkParams,
                              filePaths: changedFiles,
                          },
                          persistence
                      )
                    : { issues: [] };

            while (issues.length > 0) {
                const objective = fixIssuesPromptText({
                    objective: input.objective,
                    changedFiles,
                    issues,
                    language: 'TypeScript',
                });

                const secondResult =
                    await refactorObjectiveWithPersistence.transform(
                        {
                            objective,
                            startCommit: input.startCommit,
                            sandboxDirectoryPath: input.sandboxDirectoryPath,
                            budgetCents: input.budgetCents,
                            lintScripts: input.lintScripts,
                            testScripts: input.testScripts,
                        },
                        persistence
                    );

                mergeRefactorFilesResults({
                    from: secondResult.files,
                    into: files,
                });

                changedFiles = getChangedFiles();

                const finalCheck = await checkWithPersistence.transform(
                    {
                        ...checkParams,
                        filePaths: changedFiles,
                    },
                    persistence
                );

                issues.splice(0, issues.length - 1, ...finalCheck.issues);
            }
        } finally {
            if (persistence) {
                await refactorObjectiveWithPersistence.clean(persistence);
                await checkWithPersistence.clean(persistence);
            }
        }

        return {
            files,
        };
    },
});

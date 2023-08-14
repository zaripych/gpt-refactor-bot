import assert from 'assert';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { z } from 'zod';

import { AbortError } from '../errors/abortError';
import { CycleDetectedError } from '../errors/cycleDetectedError';
import { gitFilesDiff } from '../git/gitFilesDiff';
import { gitRevParse } from '../git/gitRevParse';
import { determinePackageManager } from '../package-manager/determinePackageManager';
import { makePipelineFunction } from '../pipeline/makePipelineFunction';
import { retry } from '../utils/retry';
import { applyChanges } from './applyChanges';
import { check, checksSummary } from './check';
import { editFilePrompt } from './editFile';
import { formatCommitMessage } from './prompts/formatCommitMessage';
import { formatFileContents } from './prompts/formatFileContents';
import { formatIssues } from './prompts/formatIssues';
import type { Issue } from './types';
import {
    lastCommit,
    refactorConfigSchema,
    refactorFileResultSchema,
} from './types';

export const refactorFileInputSchema = refactorConfigSchema
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
        filePath: z.string(),
        startCommit: z.string(),
        sandboxDirectoryPath: z.string(),
    })
    .transform(async (input) => ({
        ...input,
        /**
         * @note result of this task depends on the source code state
         */
        fileDiff: await gitFilesDiff({
            location: input.sandboxDirectoryPath,
            filePaths: [input.filePath],
            ref: input.startCommit,
        }),
    }));

function performFileRefactoringPromptText(opts: {
    objective: string;
    filePath: string;
    fileContents: string;
    language: string;
}) {
    return `${opts.objective}

${formatFileContents(opts)}

Perform modifications to the file according to the goal`;
}

function fixIssuesPromptText(opts: {
    objective: string;
    filePath: string;
    fileContents: string;
    language: string;
    issues: string[];
}) {
    return `${opts.objective}

${formatFileContents(opts)}

${formatIssues(opts)}

Fix the issues in the file keeping in mind the goal`;
}

export const refactorFileUntilChecksPass = makePipelineFunction({
    name: 'file-wp',
    inputSchema: refactorFileInputSchema,
    resultSchema: refactorFileResultSchema,
    transform: async (input, persistence) => {
        const { filePath, sandboxDirectoryPath } = input;

        const editFileWithPersistence = editFilePrompt.withPersistence().retry({
            maxAttempts: 3,
        });

        const checkWithPersistence = check.withPersistence();

        const scripts = [...input.lintScripts, ...input.testScripts];

        const packageManager = await determinePackageManager({
            directory: input.sandboxDirectoryPath,
        });

        const steps = new Array<{
            commit: string;
            task: 'refactor' | 'fix-issues';
            key: string;
            patch: string;
            fileContents: string;
            checkSummary: ReturnType<typeof checksSummary>;
        }>();
        const initialCheck = await checkWithPersistence.transform(
            {
                packageManager,
                location: input.sandboxDirectoryPath,
                startCommit: input.startCommit,
                filePaths: [filePath],
                scripts,
            },
            persistence
        );
        if (initialCheck.issues.length > 0) {
            throw new AbortError('We should have no errors initially');
        }
        const issues: Issue[] = [];
        const commonEditOpts = {
            filePath,
            sandboxDirectoryPath: input.sandboxDirectoryPath,
            budgetCents: input.budgetCents,
        };

        const buildResult = () => {
            return {
                filePath,
                issues,
                steps: steps.map((step) => ({
                    commit: step.commit,
                    fileContents: step.fileContents,
                    task: step.task,
                })),
                lastCommit: lastCommit(steps),
            };
        };

        try {
            const startCommit = await gitRevParse({
                location: input.sandboxDirectoryPath,
                ref: 'HEAD',
            });
            do {
                try {
                    const fileContents = await readFile(
                        join(input.sandboxDirectoryPath, filePath),
                        'utf-8'
                    );

                    const objective =
                        issues.length === 0
                            ? performFileRefactoringPromptText({
                                  fileContents,
                                  filePath,
                                  language: 'TypeScript',
                                  objective: input.objective,
                              })
                            : fixIssuesPromptText({
                                  fileContents,
                                  filePath,
                                  language: 'TypeScript',
                                  objective: input.objective,
                                  issues: issues.map(({ issue }) => issue),
                              });

                    await retry(
                        async (attempt) => {
                            const editResult =
                                await editFileWithPersistence.transform(
                                    {
                                        objective,
                                        fileContents,
                                        ...commonEditOpts,
                                        ...(attempt > 1 && {
                                            attempt,
                                        }),
                                    },
                                    persistence
                                );

                            if (editResult.status !== 'success') {
                                if (issues.length > 0) {
                                    throw new Error(
                                        `The model has failed to fix issues`
                                    );
                                }
                            }

                            if (!editResult.fileContents) {
                                return;
                            }

                            const commitMessage =
                                issues.length === 0
                                    ? formatCommitMessage({
                                          type: 'refactor',
                                          filePath,
                                          description: input.objective,
                                      })
                                    : formatCommitMessage({
                                          type: 'fix',
                                          filePath,
                                          description: issues
                                              .map((issue) => issue.issue)
                                              .join('\n'),
                                      });

                            const { commit } = await applyChanges({
                                commitMessage,
                                filePath,
                                sandboxDirectoryPath,
                                fileContents: editResult.fileContents,
                                fileContentsHash: editResult.fileContentsHash,
                                scripts,
                            });

                            const checkResult =
                                await checkWithPersistence.transform(
                                    {
                                        packageManager,
                                        location: input.sandboxDirectoryPath,
                                        startCommit: input.startCommit,
                                        scripts,
                                    },
                                    persistence
                                );

                            const checkSummary = checksSummary({
                                issues,
                                checkResult,
                            });

                            issues.splice(
                                0,
                                issues.length,
                                ...checkSummary.issues
                            );

                            const key = editResult.key;
                            assert(key);

                            steps.push({
                                task: 'refactor',
                                key,
                                patch: await gitFilesDiff({
                                    location: input.sandboxDirectoryPath,
                                    filePaths: [filePath],
                                    ref: lastCommit(steps) || startCommit,
                                }),
                                fileContents: editResult.fileContents,
                                commit,
                                checkSummary,
                            });
                        },
                        {
                            maxAttempts: 3,
                        }
                    );
                } catch (exc) {
                    if (exc instanceof CycleDetectedError) {
                        const error = exc;
                        const stepsLeadingToCycle = steps.slice(
                            steps.findIndex((step) => step.key === error.key)
                        );
                        console.log(stepsLeadingToCycle);
                        throw new AbortError(
                            'Cycle detected, handle please TODO'
                        );
                    } else {
                        throw exc;
                    }
                }
            } while (issues.length > 0);
        } finally {
            if (persistence) {
                await editFileWithPersistence.clean(persistence);
                await checkWithPersistence.clean(persistence);
            }
        }

        return {
            status: 'success' as const,
            ...buildResult(),
        };
    },
});

import assert from 'assert';
import { readFile } from 'fs/promises';
import orderBy from 'lodash-es/orderBy';
import { basename, join } from 'path';
import { z } from 'zod';

import { makeCachedFunction } from '../cache/makeCachedFunction';
import { AbortError } from '../errors/abortError';
import { CycleDetectedError } from '../errors/cycleDetectedError';
import { OutOfContextBoundsError } from '../errors/outOfContextBoundsError';
import { functionsRepositorySchema } from '../functions/prepareFunctionsRepository';
import { gitDiffRange } from '../git/gitDiffRange';
import { gitFilesDiff } from '../git/gitFilesDiff';
import { gitResetHard } from '../git/gitResetHard';
import { gitRevParse } from '../git/gitRevParse';
import { startCollectingLlmUsage } from '../llm/collectLlmUsage';
import { llmDependenciesSchema } from '../llm/llmDependencies';
import { logger } from '../logger/logger';
import type { IdentifierChange } from '../ts-morph/quick-info/changeInfo';
import { changeInfo } from '../ts-morph/quick-info/changeInfo';
import { ensureHasOneElement, hasTwoElements } from '../utils/hasOne';
import { UnreachableError } from '../utils/UnreachableError';
import { applyChanges } from './applyChanges';
import { chunkyEdit } from './chunkyEdit';
import { checksSummary } from './code-checking/check';
import { checkDependenciesSchema } from './code-checking/prepareCodeCheckingDeps';
import { formatDependenciesSchema } from './code-formatting/prepareCodeFormattingDeps';
import { edit } from './edit';
import { formatCommitMessage } from './prompts/formatCommitMessage';
import { formatFileContents } from './prompts/formatFileContents';
import { formatFileDiff } from './prompts/formatFileDiff';
import { formatIssues } from './prompts/formatIssues';
import type { Issue } from './types';
import { lastCommit, lastTimestamp, refactorFileResultSchema } from './types';

export const refactorFileInputSchema = z
    .object({
        objective: z.string(),
        filePath: z.string(),
        startCommit: z.string(),
        sandboxDirectoryPath: z.string(),

        llmDependencies: llmDependenciesSchema,
        checkDependencies: checkDependenciesSchema,
        formatDependencies: formatDependenciesSchema,
        functionsRepository: functionsRepositorySchema,
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
    return [
        `Goal:`,
        opts.objective,
        formatFileContents(opts),
        `Perform modifications to the file according to the goal. Do not make modifications to the exported symbols, unless they are backward compatible.`,
    ]
        .map((t) => t.trim())
        .filter(Boolean)
        .join('\n\n');
}

function formatModifiedExports(opts: {
    headline?: string;
    changedExports: Map<string, IdentifierChange>;
}) {
    const headline =
        opts.headline ??
        `After analysis, following exported symbols have been found their semantic representation modified as a result of the code modifications:`;

    const modifiedExports = Array.from(opts.changedExports.values())
        .filter((e) => e.type === 'modified' && e.quickInfoDiff !== undefined)
        .map(
            (e) => `- The \`${e.identifier}\`

\`\`\`diff
${String(e.quickInfoDiff)}
\`\`\`
`
        );

    return opts.changedExports.size > 0
        ? `
${headline}

${modifiedExports.map((e) => e).join('\n')}
`
        : ``;
}

function fixExportIssuesPromptText(opts: {
    objective: string;
    filePath: string;
    fileContents: string;
    fileDiff: string;
    language: string;
    issues: string[];
    advice?: string[];
    changedExports: Map<string, IdentifierChange>;
}) {
    return [
        `Goal:`,
        opts.objective,
        `You have made modifications to reach the goal.`,
        formatFileDiff(opts),
        formatFileContents(opts),
        formatIssues(opts),
        formatModifiedExports(opts),
        opts.advice?.join('\n'),
        `Now only revert the changes related to the mentioned exported symbols, to fix the issues.`,
    ]
        .filter(Boolean)
        .filter((text) => text?.trim())
        .join('\n\n');
}

function fixLocalIssuesPromptText(opts: {
    objective: string;
    filePath: string;
    fileContents: string;
    fileDiff: string;
    language: string;
    issues: string[];
    advice?: string[];
}) {
    return [
        `Goal:`,
        opts.objective,
        `You have made modifications to reach the goal.`,
        formatFileDiff(opts),
        formatFileContents(opts),
        formatIssues(opts),
        opts.advice?.join('\n'),
        `Fix the issues in the file keeping in mind the goal. Consider reverting the changes, as the issues didn't exist before the changes were made.`,
    ]
        .filter(Boolean)
        .filter((text) => text?.trim())
        .join('\n\n');
}

export const refactorFile = makeCachedFunction({
    name: 'file',
    inputSchema: refactorFileInputSchema,
    resultSchema: refactorFileResultSchema,
    transform: async (input, ctx) => {
        const { filePath, sandboxDirectoryPath } = input;

        const refactorFileLlmUsage = startCollectingLlmUsage({
            key: ctx.location,
        });

        try {
            const steps = new Array<{
                commit?: string;
                task: 'refactor' | 'fix-issues' | 'fix-export-issues';
                key: string;
                patch?: string;
                fileContents: string;
                checkSummary?: ReturnType<typeof checksSummary>;
                timestamp: number;
            }>();

            const initialCheck = await input.checkDependencies().check(
                {
                    filePaths: [filePath],
                },
                ctx
            );

            if (initialCheck.issues.length > 0) {
                throw new AbortError(
                    'We should have no errors initially, this should be guaranteed by the initial pre-check made in refactorGoal function. If we got here there must be a bug in the code.'
                );
            }

            const issues: Issue[] = [];
            const commonEditOpts = {
                ...input,
                filePath,
                sandboxDirectoryPath: input.sandboxDirectoryPath,
            };

            const advice: string[] = [];

            const buildResult = () => {
                return {
                    filePath,
                    issues,
                    steps: steps.map((step) => ({
                        commit: step.commit,
                        fileContents: step.fileContents,
                        task: step.task,
                        checkSummary: step.checkSummary,
                        timestamp: step.timestamp,
                    })),
                    lastCommit: lastCommit(steps),
                    timestamp: lastTimestamp(steps) ?? performance.now(),
                };
            };

            const startCommit = await gitRevParse({
                location: input.sandboxDirectoryPath,
                ref: 'HEAD',
            });
            const initialFileContents = await readFile(
                join(input.sandboxDirectoryPath, filePath),
                'utf-8'
            );
            do {
                try {
                    const fileContents = await readFile(
                        join(input.sandboxDirectoryPath, filePath),
                        'utf-8'
                    );

                    const fileDiff = await gitFilesDiff({
                        location: input.sandboxDirectoryPath,
                        filePaths: [filePath],
                        ref: startCommit,
                    });

                    const localIssues = issues.filter(
                        (issue) => issue.filePath === filePath
                    );

                    const externalIssues = issues.filter(
                        (issue) => issue.filePath !== filePath
                    );

                    let task: 'refactor' | 'fix-issues' | 'fix-export-issues' =
                        'refactor';
                    if (issues.length > 0) {
                        if (localIssues.length > 0) {
                            task = 'fix-issues';
                        } else {
                            task = 'fix-export-issues';
                        }
                    }

                    let objective: string;
                    switch (task) {
                        case 'refactor':
                            objective = performFileRefactoringPromptText({
                                fileContents,
                                filePath,
                                language: 'TypeScript',
                                objective: input.objective,
                            });
                            break;
                        case 'fix-issues':
                            objective = fixLocalIssuesPromptText({
                                fileContents,
                                filePath,
                                language: 'TypeScript',
                                objective: input.objective,
                                issues: localIssues.map(({ issue }) => issue),
                                fileDiff,
                                advice,
                            });
                            break;
                        case 'fix-export-issues':
                            objective = fixExportIssuesPromptText({
                                fileContents,
                                filePath,
                                language: 'TypeScript',
                                objective: input.objective,
                                issues: externalIssues.map(
                                    ({ issue }) => issue
                                ),
                                fileDiff,
                                advice,
                                ...(await changeInfo({
                                    location: input.sandboxDirectoryPath,
                                    oldFileContents: initialFileContents,
                                    newFileContents: fileContents,
                                    filePath,
                                    fileDiff,
                                })),
                            });
                            break;
                        default:
                            throw new UnreachableError(task);
                    }

                    const chosenEdit = process.argv.includes(
                        '--experiment-chunky-edit-strategy'
                    )
                        ? chunkyEdit
                        : edit;

                    const { choices } = await chosenEdit(
                        {
                            ...commonEditOpts,
                            objective,
                            fileContents,
                        },
                        ctx
                    );

                    const editResult = choices[0];

                    if (editResult.status !== 'success') {
                        if (issues.length > 0) {
                            const file = {
                                status: 'failure' as const,
                                failureDescription:
                                    'The model has failed to fix the issues in the file',
                                ...buildResult(),
                            };

                            return {
                                ...(ctx.location && {
                                    key: ctx.location,
                                }),
                                file,
                                usage: refactorFileLlmUsage.finishCollecting(),
                            };
                        } else {
                            const key = editResult.key;
                            assert(key);
                            steps.push({
                                task,
                                key,
                                fileContents,
                                timestamp: performance.now(),
                            });
                        }
                        continue;
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
                    });

                    const checkResult = await input
                        .checkDependencies()
                        .check({}, ctx);

                    const checkSummary = checksSummary({
                        issues,
                        checkResult,
                        checkCommit: commit,
                    });

                    issues.splice(
                        0,
                        issues.length,
                        ...checkSummary.newIssues,
                        ...checkSummary.remainingIssues
                    );

                    const key = editResult.key;
                    assert(key);

                    steps.push({
                        task,
                        key,
                        patch: await gitFilesDiff({
                            location: input.sandboxDirectoryPath,
                            filePaths: [filePath],
                            ref: lastCommit(steps) || startCommit,
                        }),
                        fileContents: editResult.fileContents,
                        commit,
                        checkSummary,
                        timestamp: performance.now(),
                    });
                } catch (exc) {
                    if (exc instanceof CycleDetectedError) {
                        const error = exc;
                        const index = steps.findIndex(
                            (step) => step.key === error.key
                        );
                        const stepsLeadingToCycle = steps
                            .slice(index)
                            .filter((step) => step.commit !== undefined);
                        const leastProblematicStep = ensureHasOneElement(
                            orderBy(
                                stepsLeadingToCycle,
                                (step) =>
                                    step.checkSummary?.totalNumberOfIssues ?? 0,
                                'asc'
                            )
                        )[0];
                        const leastProblematicStepIndex =
                            stepsLeadingToCycle.findIndex(
                                (value) => value === leastProblematicStep
                            );

                        /**
                         * @todo haven't seen more complex cycles at this
                         * moment, but it could be possible, so let's double
                         * check that we are hitting the expected case
                         */
                        if (hasTwoElements(stepsLeadingToCycle)) {
                            const [startRef, endRef] =
                                leastProblematicStepIndex === 0
                                    ? [
                                          leastProblematicStep.commit,
                                          stepsLeadingToCycle[1].commit,
                                      ]
                                    : [
                                          leastProblematicStep.commit,
                                          stepsLeadingToCycle[0].commit,
                                      ];
                            const mostIssues = stepsLeadingToCycle.reduce(
                                (a, b) =>
                                    Math.max(
                                        a,
                                        b.checkSummary?.totalNumberOfIssues ?? 0
                                    ),
                                0
                            );

                            // we check for commit !== undefined above
                            assert(startRef);
                            assert(endRef);
                            assert(leastProblematicStep.commit);

                            const patch = await gitDiffRange({
                                location: input.sandboxDirectoryPath,
                                filePaths: [filePath],
                                startRef,
                                endRef,
                            });
                            //
                            advice.push(
                                formatFileDiff({
                                    fileDiff: patch,
                                    filePath,
                                    headline: `Do not make changes represented by the following diff as that would cause ${mostIssues} lint and compilation issues:`,
                                })
                            );
                            await gitResetHard({
                                location: input.sandboxDirectoryPath,
                                ref: leastProblematicStep.commit,
                            });
                            const leastProblematicStepGlobalIndex =
                                steps.findIndex(
                                    (value) => value === leastProblematicStep
                                );
                            steps.splice(
                                leastProblematicStepGlobalIndex + 1,
                                steps.length -
                                    leastProblematicStepGlobalIndex +
                                    1
                            );
                            issues.splice(
                                0,
                                issues.length,
                                ...(leastProblematicStep.checkSummary
                                    ?.newIssues || []),
                                ...(leastProblematicStep.checkSummary
                                    ?.remainingIssues || [])
                            );

                            logger.debug('Handling cycle', {
                                leastProblematicStepIndex,
                                leastProblematicStepCommit:
                                    leastProblematicStep.commit,
                                key: error.key,
                                advice,
                                steps: steps.map((step) => ({
                                    task: step.task,
                                    key: basename(step.key),
                                    commit: step.commit,
                                    totalNumberOfIssues:
                                        step.checkSummary
                                            ?.totalNumberOfIssues ?? 0,
                                })),
                            });
                        } else {
                            logger.log(stepsLeadingToCycle);
                            logger.log({
                                leastProblematicStepIndex,
                                leastProblematicStepCommit:
                                    leastProblematicStep.commit,
                                key: error.key,
                                advice,
                                steps: steps.map((step) => ({
                                    task: step.task,
                                    key: basename(step.key),
                                    commit: step.commit,
                                    totalNumberOfIssues:
                                        step.checkSummary
                                            ?.totalNumberOfIssues ?? 0,
                                })),
                            });
                            throw exc;
                        }
                    } else {
                        throw exc;
                    }
                }
            } while (issues.length > 0);

            const file = {
                status: 'success' as const,
                ...buildResult(),
            };

            return {
                ...(ctx.location && {
                    key: ctx.location,
                }),
                file,
                usage: refactorFileLlmUsage.finishCollecting(),
            };
        } catch (err) {
            /**
             * If there was any error - do not save to the cache
             */
            ctx.skipSavingToCache(err);

            if (
                err instanceof AbortError &&
                !(err instanceof CycleDetectedError) &&
                !(err instanceof OutOfContextBoundsError)
            ) {
                return Promise.reject(err);
            }

            return {
                ...(ctx.location && {
                    key: ctx.location,
                }),
                file: {
                    status: 'failure' as const,
                    failureDescription:
                        err instanceof Error ? err.message : String(err),
                    filePath: input.filePath,
                    issues: [],
                    steps: [],
                    timestamp: performance.now(),
                },
                usage: refactorFileLlmUsage.finishCollecting(),
            };
        }
    },
});

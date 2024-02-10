import assert from 'assert';
import type { ObservedValueOf } from 'rxjs';
import {
    concatMap,
    from,
    lastValueFrom,
    map,
    mergeMap,
    range,
    scan,
    startWith,
    toArray,
    zip,
} from 'rxjs';
import { z } from 'zod';

import { refactorResultSchema } from '../benchmark/refactorResultSchema';
import { makeCachedFunction } from '../cache/makeCachedFunction';
import type { CacheStateRef } from '../cache/types';
import { functionsRepositorySchema } from '../functions/prepareFunctionsRepository';
import { llmDependenciesSchema } from '../llm/llmDependencies';
import { avg } from '../math/avg';
import { summarizeRefactorFilesResult } from '../refactor/types';
import { evaluateFileScore } from './evaluateFileScore';
import { extractRequirements } from './extractRequirements';

const evaluateRefactorResultOptsSchema = z.object({
    /**
     * Temperature to use with the LLM for evaluation
     */
    temperature: z.number().optional(),

    /**
     * Number of choices to request from the model
     */
    choices: z.number(),

    /**
     * Results of the refactor we are evaluating
     */
    result: refactorResultSchema,

    index: z.number().optional(),

    llmDependencies: llmDependenciesSchema,
    functionsRepository: functionsRepositorySchema,
});

const evaluateRefactorResultOnceSchema =
    evaluateRefactorResultOptsSchema.augment({
        /**
         * Objective split into requirements, we do the splitting
         * beforehand to avoid LLM trying to do multiple things at once and/or
         * producing extra unnecessary variance
         */
        requirements: z.array(z.string()).nonempty(),
    });

const evaluateRefactorResultOnce = makeCachedFunction({
    inputSchema: evaluateRefactorResultOnceSchema,
    resultSchema: z.object({
        key: z.string().optional(),
        score: z.number(),
        scorePerFile: z.record(z.number()),
    }),
    name: 'eval-refactor',
    transform: async (
        opts: z.output<typeof evaluateRefactorResultOnceSchema>,
        ctx?: CacheStateRef
    ) => {
        const {
            requirements,
            result: { sandboxDirectoryPath, startCommit },
        } = opts;

        const { accepted, discarded } = summarizeRefactorFilesResult({
            accepted: opts.result.accepted,
            discarded: opts.result.discarded,
        });

        const stepsPerFile = from([
            ...Object.entries({
                ...discarded.resultsByFilePaths,
                ...accepted.resultsByFilePaths,
            }),
        ]).pipe(
            mergeMap(([filePath, results]) =>
                from(results).pipe(
                    mergeMap(({ file: result }) =>
                        result.steps.map((step) => ({
                            filePath,
                            task: step.task,
                            timestamp: step.timestamp,
                            commit: step.commit,
                            checkSummary: step.checkSummary,
                        }))
                    ),
                    (stream) =>
                        zip(
                            stream,
                            stream.pipe(
                                scan(
                                    (commitBeforeChanges, next) =>
                                        /**
                                         * When an attempt to refactor a file
                                         * resulted in no commits, take previous
                                         * commit as a commitBeforeChanges.
                                         */ next.commit
                                            ? next.commit
                                            : commitBeforeChanges,
                                    startCommit
                                ),
                                // make this one lag one step behind
                                startWith(startCommit)
                            )
                        ),
                    map(([step, commitBeforeChanges]) => ({
                        ...step,
                        commitBeforeChanges,
                    })),
                    toArray(),
                    map((steps) => ({
                        filePath,
                        steps,
                    }))
                )
            ),
            map(({ filePath, steps }) => {
                const first = steps[0];
                const last = steps[steps.length - 1];
                if (first === last) {
                    return {
                        filePath,
                        steps,
                    };
                } else {
                    return {
                        filePath,
                        steps: [
                            {
                                ...last,
                                commitBeforeChanges:
                                    first?.commitBeforeChanges || startCommit,
                                filePath,
                            },
                        ],
                    };
                }
            })
        );

        const evaluateStep = async (
            step: ObservedValueOf<typeof stepsPerFile>['steps'][number]
        ) => {
            const issues = [
                ...(step.checkSummary?.newIssues || []),
                ...(step.checkSummary?.remainingIssues || []),
            ].map((issue) => issue.issue);

            return {
                ...(await evaluateFileScore(
                    {
                        ...opts,
                        sandboxDirectoryPath,
                        index: opts.index,
                        requirements,
                        filePath: step.filePath,
                        commitBeforeChanges: step.commitBeforeChanges,
                        commit: step.commit,
                        issues,
                    },
                    ctx
                )),
                filePath: step.filePath,
            };
        };

        const scorePerFile = await lastValueFrom(
            stepsPerFile.pipe(
                mergeMap(({ steps, filePath }) => {
                    return from(steps).pipe(
                        //
                        concatMap(evaluateStep),
                        toArray(),
                        map((steps) => {
                            assert(
                                steps.every(
                                    (step) => step.filePath === filePath
                                )
                            );
                            return {
                                filePath,
                                score: avg(steps.map((r) => r.score)),
                                steps,
                            };
                        })
                    );
                }, 2),
                toArray()
            )
        );

        const score = avg(scorePerFile.map((r) => r.score));

        return {
            key: ctx?.location,
            score,
            scorePerFile: Object.fromEntries(
                scorePerFile.map((r) => [r.filePath, r.score])
            ),
        };
    },
});

export async function evaluateRefactorResult(
    opts: z.output<typeof evaluateRefactorResultOptsSchema> & {
        times: number;
    },
    ctx?: CacheStateRef
) {
    const extractRequirementsResult = await extractRequirements(
        {
            ...opts,
            objective: opts.result.objective,
            choices: 2,
            temperature: opts.temperature,
        },
        ctx
    );

    const requirements = extractRequirementsResult.choices.reduce(
        (acc, choice) =>
            choice.requirements.length > acc.length ? acc : choice.requirements,
        extractRequirementsResult.choices[0].requirements
    );

    return await lastValueFrom(
        range(0, opts.times).pipe(
            mergeMap(
                (index) =>
                    evaluateRefactorResultOnce(
                        { ...opts, requirements, index },
                        ctx
                    ),
                4
            ),
            toArray(),
            map((evaluations) => {
                const score = avg(evaluations.map((r) => r.score));
                const filePaths = new Set(
                    evaluations.flatMap((r) => Object.keys(r.scorePerFile))
                );
                return {
                    score,
                    evaluations,
                    scorePerFile: Object.fromEntries(
                        [...filePaths].map((filePath) => {
                            const scores = evaluations
                                .map((r) => r.scorePerFile[filePath])
                                .filter((s) => s !== undefined) as number[];
                            return [filePath, avg(scores)];
                        })
                    ),
                };
            })
        )
    );
}

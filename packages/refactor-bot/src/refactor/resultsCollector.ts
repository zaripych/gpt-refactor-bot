import { z } from 'zod';

import {
    executionStarted,
    executionTiming,
} from '../cache/actions/executionStatus';
import { explainCacheKey } from '../cache/cache';
import { actions } from '../event-bus';
import { ofTypes } from '../event-bus/operators';
import { startCollectingLlmUsage } from '../llm/collectLlmUsage';
import { extractErrorInfo } from '../logger/extractErrorInfo';
import { logger } from '../logger/logger';
import { line } from '../text/line';
import { ensureHasOneElement, hasOneElement } from '../utils/hasOne';
import { UnreachableError } from '../utils/UnreachableError';
import { acceptedEdit } from './actions/acceptedEdit';
import { checkoutSandboxCompleted } from './actions/checkoutSandboxCompleted';
import { discardedEdit } from './actions/discardedEdit';
import { planFilesCompleted } from './actions/planFilesCompleted';
import { checkoutSandboxResultSchema } from './checkoutSandbox';
import { planFilesResultSchema } from './planFiles';
import type { RefactorConfig, refactorFileResultSchema } from './types';
import { llmUsageEntrySchema, refactorFilesResultSchema } from './types';

export const collectedRefactorResultSchema = z
    .object({
        id: z.string(),
        objective: z.string(),
        status: z.enum(['success', 'failure']),
        error: z.record(z.unknown()).optional(),
    })
    .merge(checkoutSandboxResultSchema)
    .merge(refactorFilesResultSchema)
    .augment({
        planFilesResults: z.array(planFilesResultSchema),
        usage: z.array(llmUsageEntrySchema),
        performance: z.object({
            totalDurationMs: z.number(),
            timeToReplayMs: z.number().optional(),
            durationMsByStep: z.record(
                z.object({
                    durationMs: z.number(),
                })
            ),
        }),
    });

const commitHashRegex = /^[a-f0-9]{40}$/;

function scanForCommitHashes(data: unknown, ignore: string[]): string[] {
    if (typeof data === 'object' && data !== null) {
        const entries = Object.entries(data);
        for (const [key, value] of entries) {
            if (ignore.includes(key)) {
                continue;
            }

            const result = scanForCommitHashes(value, ignore);
            if (result.length > 0) {
                return result;
            }
        }
    }

    if (typeof data === 'string') {
        if (commitHashRegex.test(data) && !ignore.includes(data)) {
            return [data];
        }
    }

    return [];
}

/**
 * Results collector allows us to collect all the results of a refactor
 * operation regardless of whether the refactor was successful or not.
 *
 * This is done by subscribing to the event bus and collecting all the
 * results into a single object.
 *
 * The information collected includes the following:
 * - The checkout result
 * - The plan files result
 * - The accepted and discarded edits
 * - The costs of each step
 */
export function resultsCollector(deps = { actions }) {
    const timestamp = performance.now();

    const checkoutResults: z.infer<typeof checkoutSandboxResultSchema>[] = [];

    const planFilesResults: z.infer<typeof planFilesResultSchema>[] = [];

    const accepted: z.infer<typeof refactorFileResultSchema>[] = [];

    const discarded: z.infer<typeof refactorFileResultSchema>[] = [];

    const files = {
        accepted,
        discarded,
    };

    type DurationSample = {
        name: string;
        level: number;
        duration: number;
    };

    const samples: DurationSample[] = [];

    const usage = startCollectingLlmUsage();

    const subscription = deps
        .actions()
        .pipe(
            ofTypes(
                checkoutSandboxCompleted,
                acceptedEdit,
                discardedEdit,
                planFilesCompleted,
                executionStarted,
                executionTiming
            )
        )
        .subscribe({
            next: (event) => {
                switch (event.type) {
                    case 'checkoutSandboxCompleted':
                        checkoutResults.push(event.data);
                        break;
                    case 'acceptedEdit':
                        accepted.push(event.data);
                        break;
                    case 'discardedEdit':
                        discarded.push(event.data);
                        break;
                    case 'planFilesCompleted':
                        planFilesResults.push(event.data);
                        break;
                    case 'executionStarted':
                        {
                            if (event.data.name === 'checkout-sandbox') {
                                return;
                            }

                            const hashes = scanForCommitHashes(
                                event.data,
                                checkoutResults
                                    .map((r) => r.startCommit)
                                    .concat(['diffHash', 'filesDiffHash'])
                            );

                            if (hashes.length > 0) {
                                logger.warn(
                                    line`
                                        Found commit hash in the input of a
                                        cached function "${event.data.name}":
                                        "${hashes.join(', ')}", this is likely
                                        a mistake, because commits made at a
                                        different time will result in different
                                        hashes, which will invalidate the cache
                                        and cause the function to run again.
                                    `
                                );
                            }
                        }
                        break;
                    case 'executionTiming':
                        {
                            const steps = explainCacheKey(event.data.key) ?? [
                                { name: 'unknown', hash: 'unknown' },
                            ];

                            const level = steps.length;

                            // do not account time spent in sub-steps as
                            // time spent in the parent step multiple times
                            const name =
                                steps[steps.length - 1]?.name ?? 'unknown';

                            samples.push({
                                name,
                                level,
                                duration: event.data.duration,
                            });
                        }
                        break;
                    default:
                        throw new UnreachableError(event);
                }
            },
        });

    const finalizePerformance = () => {
        const totalDurationMs = performance.now() - timestamp;

        type DurationSummary = {
            durationMs: number;
        };

        const durationMsByStep = samples.reduce<
            { total: DurationSummary } & Record<string, DurationSummary>
        >(
            (acc, { duration, name, level }) => {
                const existing = acc[name] ?? {
                    durationMs: 0,
                };

                if (level === 1) {
                    acc.total.durationMs += duration;
                }

                return {
                    ...acc,
                    [name]: {
                        durationMs: duration + existing.durationMs,
                    },
                };
            },
            {
                total: {
                    durationMs: 0,
                },
                unknown: {
                    durationMs: 0,
                },
            }
        );

        return {
            timeToReplayMs: totalDurationMs,
            totalDurationMs: durationMsByStep.total.durationMs,
            durationMsByStep,
        };
    };

    return {
        teardown: () => {
            subscription.unsubscribe();
            usage.finishCollecting();
        },
        finalizeResults: (
            config: RefactorConfig & { id: string },
            error?: Error
        ): z.output<typeof collectedRefactorResultSchema> => {
            if (error) {
                if (!hasOneElement(checkoutResults)) {
                    throw error;
                }
                return {
                    status: 'failure' as const,
                    id: config.id,
                    error: extractErrorInfo(error),
                    objective: config.objective,
                    ...ensureHasOneElement(checkoutResults)[0],
                    ...files,
                    planFilesResults,
                    usage: usage.getUsage(),
                    performance: finalizePerformance(),
                };
            } else {
                return {
                    status: 'success' as const,
                    id: config.id,
                    objective: config.objective,
                    ...ensureHasOneElement(checkoutResults)[0],
                    ...files,
                    planFilesResults,
                    usage: usage.getUsage(),
                    performance: finalizePerformance(),
                };
            }
        },
    };
}

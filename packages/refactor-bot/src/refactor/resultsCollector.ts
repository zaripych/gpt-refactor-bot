import type { z } from 'zod';

import { executionTiming } from '../cache/actions/executionStatus';
import { explainCacheKey } from '../cache/cache';
import { calculatePrice } from '../chat-gpt/api';
import { actions } from '../event-bus';
import { ofTypes } from '../event-bus/operators';
import { ensureHasOneElement, hasOneElement } from '../utils/hasOne';
import { UnreachableError } from '../utils/UnreachableError';
import { acceptedEdit } from './actions/acceptedEdit';
import { checkoutComplete } from './actions/checkoutComplete';
import { discardedEdit } from './actions/discardedEdit';
import { gptRequestSuccess } from './actions/gptRequestSuccess';
import { planFilesComplete } from './actions/planFilesComplete';
import type { checkoutSandboxResultSchema } from './checkoutSandbox';
import type { planFilesResultSchema } from './planFiles';
import type { RefactorFilesResult } from './types';
import { mutateToMergeRefactorRecords } from './types';

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

    const files: RefactorFilesResult = {
        accepted: {},
        discarded: {},
    };

    const checkoutResults: z.infer<typeof checkoutSandboxResultSchema>[] = [];

    const planFilesResults: z.infer<typeof planFilesResultSchema>[] = [];

    const costsByStep: {
        total: ReturnType<typeof calculatePrice>;
        unknown: ReturnType<typeof calculatePrice>;
    } & Record<string, ReturnType<typeof calculatePrice>> = {
        total: {
            completionPrice: 0,
            promptPrice: 0,
            totalPrice: 0,
        },
        unknown: {
            completionPrice: 0,
            promptPrice: 0,
            totalPrice: 0,
        },
    };

    type DurationSample = {
        name: string;
        level: number;
        duration: number;
    };

    const samples: DurationSample[] = [];

    const subscription = deps
        .actions()
        .pipe(
            ofTypes(
                checkoutComplete,
                acceptedEdit,
                discardedEdit,
                planFilesComplete,
                gptRequestSuccess,
                executionTiming
            )
        )
        .subscribe({
            next: (event) => {
                switch (event.type) {
                    case 'checkoutComplete':
                        checkoutResults.push(event.data);
                        break;
                    case 'acceptedEdit':
                        mutateToMergeRefactorRecords({
                            from: {
                                [event.data.filePath]: [event.data],
                            },
                            into: files.accepted,
                        });
                        break;
                    case 'discardedEdit':
                        mutateToMergeRefactorRecords({
                            from: {
                                [event.data.filePath]: [event.data],
                            },
                            into: files.discarded,
                        });
                        break;
                    case 'planFilesComplete':
                        planFilesResults.push(event.data);
                        break;
                    case 'gptRequestSuccess':
                        {
                            const price = calculatePrice({
                                ...event.data.response,
                                model: event.data.model,
                            });

                            const steps = explainCacheKey(event.data.key) ?? [
                                { name: 'unknown', hash: 'unknown' },
                            ];

                            steps.push({ name: 'total', hash: 'unknown' });
                            steps.forEach(({ name }) => {
                                const current = costsByStep[name] ?? {
                                    completionPrice: 0,
                                    promptPrice: 0,
                                    totalPrice: 0,
                                };

                                costsByStep[name] = {
                                    completionPrice:
                                        current.completionPrice +
                                        price.completionPrice,
                                    promptPrice:
                                        current.promptPrice + price.promptPrice,
                                    totalPrice:
                                        current.totalPrice + price.totalPrice,
                                };
                            });
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
        const totalDuration = performance.now() - timestamp;

        type DurationSummary = {
            duration: number;
        };

        const durationByStep = samples.reduce<
            { total: DurationSummary } & Record<string, DurationSummary>
        >(
            (acc, { duration, name, level }) => {
                const existing = acc[name] ?? {
                    duration: 0,
                };

                if (level === 1) {
                    acc.total.duration += duration;
                }

                return {
                    ...acc,
                    [name]: {
                        duration: duration + existing.duration,
                    },
                };
            },
            {
                total: {
                    duration: 0,
                },
                unknown: {
                    duration: 0,
                },
            }
        );

        return {
            totalDuration,
            durationByStep,
        };
    };

    return {
        teardown: () => {
            subscription.unsubscribe();
        },
        finalizeResults: (error?: Error) => {
            if (error) {
                if (!hasOneElement(checkoutResults)) {
                    throw error;
                }
                return {
                    status: 'failure' as const,
                    error,
                    ...ensureHasOneElement(checkoutResults)[0],
                    ...files,
                    planFilesResults,
                    costsByStep,
                    performance: finalizePerformance(),
                };
            } else {
                return {
                    status: 'success' as const,
                    ...ensureHasOneElement(checkoutResults)[0],
                    ...files,
                    planFilesResults,
                    costsByStep,
                    performance: finalizePerformance(),
                };
            }
        },
    };
}

import type { ObservedValueOf } from 'rxjs';
import { filter, type Observable, scan, startWith, takeUntil } from 'rxjs';
import type { z } from 'zod';

import { explainCacheKey } from '../cache/cache';
import { actions, type AnyAction } from '../event-bus';
import { ofTypes } from '../event-bus/operators';
import type { llmUsageEntrySchema } from '../refactor/types';
import { gptRequestSuccess } from './actions/gptRequestSuccess';

type Usage = z.output<typeof llmUsageEntrySchema>;

export const collectLlmUsage =
    (opts?: { key?: string }) => (input: Observable<AnyAction>) =>
        input.pipe(
            ofTypes(gptRequestSuccess),
            filter((event) => {
                if (!opts?.key) {
                    return true;
                }

                if (event.data.key?.startsWith(opts.key)) {
                    return true;
                }
                return false;
            }),
            scan((usageByStep, event) => {
                const steps = explainCacheKey(event.data.key) ?? [
                    { name: 'unknown', hash: 'unknown' },
                ];

                const usage = event.data.response.usage;

                usageByStep.push({
                    model: event.data.model,
                    steps: steps.map((x) => x.name),
                    usage,
                });

                return usageByStep;
            }, [] as Array<Usage>),
            startWith([] as Array<Usage>)
        );

export function startCollectingLlmUsage(
    opts?: {
        key?: string;
        until?: Observable<unknown>;
    },
    deps = { actions }
) {
    let result: ObservedValueOf<ReturnType<ReturnType<typeof collectLlmUsage>>>;
    const subscription = deps
        .actions()
        .pipe(
            opts?.until ? takeUntil(opts.until) : (stream) => stream,
            collectLlmUsage(opts)
        )
        .subscribe({
            next: (usage) => {
                result = usage;
            },
        });

    return {
        getUsage() {
            return result;
        },
        finishCollecting() {
            subscription.unsubscribe();
            return result;
        },
    };
}

export function summarizeLlmUsageTokens(params: { usage: Array<Usage> }) {
    const tokensBySteps = new Map<
        string,
        {
            promptTokens: number;
            completionTokens: number;
            totalTokens: number;
        }
    >();

    let totalTokens = 0;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;

    for (const { usage, steps } of params.usage) {
        for (const step of steps) {
            const current = tokensBySteps.get(step) ?? {
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
            };

            tokensBySteps.set(step, {
                promptTokens: current.promptTokens + usage.promptTokens,
                completionTokens:
                    current.completionTokens + usage.completionTokens,
                totalTokens: current.totalTokens + usage.totalTokens,
            });
        }

        totalTokens += usage.totalTokens;
        totalPromptTokens += usage.promptTokens;
        totalCompletionTokens += usage.completionTokens;
    }

    return {
        tokensBySteps,
        totalTokens,
        totalPromptTokens,
        totalCompletionTokens,
    };
}

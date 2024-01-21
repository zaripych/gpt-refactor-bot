import type { ObservedValueOf } from 'rxjs';
import { filter, type Observable, scan, startWith } from 'rxjs';
import type { z } from 'zod';

import { explainCacheKey } from '../cache/cache';
import { calculatePrice } from '../chat-gpt/api';
import { actions, type AnyAction } from '../event-bus';
import { ofTypes } from '../event-bus/operators';
import { gptRequestSuccess } from './actions/gptRequestSuccess';
import type { llmUsageEntrySchema } from './types';

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
    opts?: { key?: string },
    deps = { actions }
) {
    let result: ObservedValueOf<ReturnType<ReturnType<typeof collectLlmUsage>>>;
    const subscription = deps
        .actions()
        .pipe(collectLlmUsage(opts))
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

export function summarizeLlmUsagePrice(params: { usage: Array<Usage> }) {
    const priceBySteps = new Map<
        string,
        {
            promptPrice: number;
            completionPrice: number;
            totalPrice: number;
        }
    >();

    let totalPrice = 0;

    for (const { model, usage, steps } of params.usage) {
        const price = calculatePrice({ model, usage });

        for (const step of steps) {
            const current = priceBySteps.get(step) ?? {
                promptPrice: 0,
                completionPrice: 0,
                totalPrice: 0,
            };

            priceBySteps.set(step, {
                promptPrice: current.promptPrice + price.promptPrice,
                completionPrice:
                    current.completionPrice + price.completionPrice,
                totalPrice: current.totalPrice + price.totalPrice,
            });
        }

        totalPrice += price.totalPrice;
    }

    return {
        priceBySteps,
        totalPrice,
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
    }

    return {
        tokensBySteps,
        totalTokens,
    };
}

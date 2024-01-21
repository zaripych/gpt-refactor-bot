import type { z } from 'zod';

import { avg } from '../evaluate/utils/avg';
import { sum } from '../evaluate/utils/sum';
import { summarizeLlmUsageTokens } from '../refactor/collectLlmUsage';
import type { refactorResultSchema } from './refactorResultSchema';

export function summarizeCosts(opts: {
    results: Array<z.output<typeof refactorResultSchema>>;
}) {
    const summaries = opts.results.map((result) => {
        const { totalTokens } = summarizeLlmUsageTokens(result);

        const wastedTokens = sum(
            result.discarded.map((result) =>
                sum(result.usage.map((usage) => usage.usage.totalTokens))
            )
        );

        return {
            totalTokens,
            wastedTokensRatio: wastedTokens / totalTokens,
        };
    });

    return {
        /**
         * Average number of tokens used in the refactor
         */
        totalTokens: avg(summaries.map((summary) => summary.totalTokens)),

        /**
         * Average ratio of tokens used to produce results which were discarded
         * during the refactor
         */
        wastedTokensRatio: avg(
            summaries.map((summary) => summary.wastedTokensRatio)
        ),
    };
}

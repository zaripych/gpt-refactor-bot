import { outliers } from '../math/outliers';
import { sum } from '../math/sum';
import { summarizeLlmUsageTokens } from '../refactor/llm/collectLlmUsage';
import type { LoadedRefactorResult } from './loadRefactorResult';

export function summarizeCosts(opts: { results: Array<LoadedRefactorResult> }) {
    const summaries = opts.results.map((result) => {
        const { totalTokens, totalCompletionTokens, totalPromptTokens } =
            summarizeLlmUsageTokens(result);

        const wastedTokens = sum(
            result.discarded.map((result) =>
                sum(result.usage.map((usage) => usage.usage.totalTokens))
            )
        );

        return {
            totalTokens,
            totalPromptTokens,
            totalCompletionTokens,
            wastedTokensRatio: wastedTokens / totalTokens,
            result,
        };
    });

    const totalTokens = outliers(summaries, (summary) => summary.totalTokens);
    const totalPromptTokens = outliers(
        summaries,
        (summary) => summary.totalPromptTokens
    );
    const totalCompletionTokens = outliers(
        summaries,
        (summary) => summary.totalCompletionTokens
    );
    const wastedTokensRatio = outliers(
        summaries,
        (summary) => summary.wastedTokensRatio
    );

    return {
        /**
         * Average number of tokens used in the refactor
         */
        totalTokens: totalTokens.average,
        totalPromptTokens: totalPromptTokens.average,
        totalCompletionTokens: totalCompletionTokens.average,

        /**
         * Average ratio of tokens used to produce results which were discarded
         * during the refactor
         */
        wastedTokensRatio: wastedTokensRatio.average,

        outliers: [
            ...new Set([
                ...totalTokens.outliers,
                ...wastedTokensRatio.outliers,
            ]),
        ],
    };
}

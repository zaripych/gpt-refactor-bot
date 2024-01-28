import { outliers } from '../math/outliers';
import type { LoadedRefactorResult } from './loadRefactorResult';

export function summarizePerformance(opts: {
    results: Array<LoadedRefactorResult>;
}) {
    const summaries = opts.results.map((result) => {
        return {
            durationMs: result.performance.durationMsByStep.total.durationMs,
            result,
        };
    });

    const durationMs = outliers(summaries, (summary) => summary.durationMs);

    return {
        /**
         * Average duration of the refactor
         */
        durationMs: durationMs.average,

        outliers: [...new Set([...durationMs.outliers])],
    };
}

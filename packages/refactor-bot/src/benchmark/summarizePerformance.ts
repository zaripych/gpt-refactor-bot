import type { z } from 'zod';

import { avg } from '../evaluate/utils/avg';
import type { refactorResultSchema } from './refactorResultSchema';

export function summarizePerformance(opts: {
    results: Array<z.output<typeof refactorResultSchema>>;
}) {
    const summaries = opts.results.map((result) => {
        return {
            totalDurationMs: result.performance.totalDurationMs,
        };
    });

    return {
        /**
         * Average duration of the refactor
         */
        durationMs: avg(summaries.map((summary) => summary.totalDurationMs)),
    };
}

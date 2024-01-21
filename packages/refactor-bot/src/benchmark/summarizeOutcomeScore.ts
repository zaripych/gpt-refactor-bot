import type { z } from 'zod';

import { avg } from '../evaluate/utils/avg';
import { summarizeRefactorFilesResult } from '../refactor/types';
import type { refactorResultSchema } from './refactorResultSchema';

export function summarizeOutcomeScore(opts: {
    results: Array<z.output<typeof refactorResultSchema>>;
}) {
    const summaries = opts.results.map((result) => {
        const { accepted, discarded } = summarizeRefactorFilesResult(result);

        const acceptedFileNames = Object.keys(accepted.resultsByFilePaths);
        const discardedFileNames = Object.keys(discarded.resultsByFilePaths);

        if (acceptedFileNames.length === 0 && discardedFileNames.length === 0) {
            return {
                score: 0,
                acceptedRatio: 0,
            };
        }

        const score = avg([
            ...Object.values(accepted.resultsByFilePaths).map((results) =>
                avg(results.map((result) => result.evaluation?.score ?? 0))
            ),
            ...Object.values(discarded.resultsByFilePaths).map((results) =>
                avg(results.map((result) => result.evaluation?.score ?? 0))
            ),
        ]);

        return {
            score,
            acceptedRatio:
                acceptedFileNames.length /
                (acceptedFileNames.length + discardedFileNames.length),
        };
    });

    return {
        /**
         * Average evaluation score for all refactors
         *
         * This score reflects whether the refactoring objective is fully
         * complete or not. Value of 1 means that all requirements were met,
         * value of 0 means that none of the requirements were met.
         */
        score: avg(summaries.map((summary) => summary.score)),

        /**
         * Average ratio of accepted file changes to the total number of
         * files we attempted to refactor
         */
        acceptedRatio: avg(summaries.map((summary) => summary.acceptedRatio)),
    };
}

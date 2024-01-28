import { avg } from '../math/avg';
import { outliers } from '../math/outliers';
import { summarizeRefactorFilesResult } from '../refactor/types';
import type { LoadedRefactorResult } from './loadRefactorResult';

export function summarizeOutcomeScore(opts: {
    results: Array<LoadedRefactorResult>;
}) {
    const summaries = opts.results.map((result) => {
        const { accepted, discarded } = summarizeRefactorFilesResult(result);

        const acceptedFileNames = Object.keys(accepted.resultsByFilePaths);
        const discardedFileNames = Object.keys(discarded.resultsByFilePaths);

        if (acceptedFileNames.length === 0 && discardedFileNames.length === 0) {
            return {
                score: 0,
                acceptedRatio: 0,
                result,
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
            result,
        };
    });

    const score = outliers(summaries, (summary) => summary.score);

    return {
        /**
         * Average evaluation score for all refactors
         *
         * This score reflects whether the refactoring objective is fully
         * complete or not. Value of 1 means that all requirements were met,
         * value of 0 means that none of the requirements were met.
         */
        score: score.average,

        /**
         * Average ratio of accepted file changes to the total number of
         * files we attempted to refactor
         */
        acceptedRatio: avg(summaries.map((summary) => summary.acceptedRatio)),

        outliers: [...new Set([...score.outliers])],

        lowScores: summaries
            .filter((summary) => summary.score <= 0.34)
            .map((summary) => summary),
    };
}

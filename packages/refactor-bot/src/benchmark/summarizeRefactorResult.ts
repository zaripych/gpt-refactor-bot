import { ConfigurationError } from '../errors/configurationError';
import { line } from '../text/line';
import { loadRefactorResult } from './loadRefactorResult';
import { summarizeCosts } from './summarizeCosts';
import { summarizeOutcomeScore } from './summarizeOutcomeScore';
import { summarizePerformance } from './summarizePerformance';

export async function summarizeRefactorResult(opts: {
    resultFilePaths: string[];
}) {
    const results = await Promise.all(
        opts.resultFilePaths.map((resultFilePath) =>
            loadRefactorResult({
                resultFilePath,
            })
        )
    );

    const loadedResults = results.flatMap((result) => (result ? [result] : []));

    if (loadedResults.length === 0) {
        throw new ConfigurationError(
            line`
                No parsable refactor results found, this could happen when
                refactoring has failed for all attempts of the given variant -
                double check that the configuration is correct
            `
        );
    }

    const outcomeScore = summarizeOutcomeScore({
        results: loadedResults,
    });

    const costs = summarizeCosts({
        results: loadedResults,
    });

    const performance = summarizePerformance({
        results: loadedResults,
    });

    return {
        numberOfRuns: loadedResults.length,
        ...outcomeScore,
        ...costs,
        ...performance,
    };
}

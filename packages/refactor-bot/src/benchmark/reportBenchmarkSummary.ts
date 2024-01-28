import assert from 'assert';
import chalk from 'chalk';
import { dump } from 'js-yaml';
import { relative } from 'path';
import { formatWithOptions } from 'util';

import { markdown, printMarkdown } from '../markdown/markdown';
import { formatFencedCodeBlock } from '../prompt-formatters/formatFencedCodeBlock';
import { formatOptional } from '../prompt-formatters/formatOptional';
import { format } from '../text/format';
import { hasOneElement, hasTwoElements } from '../utils/hasOne';
import type { summarizeRefactorResult } from './summarizeRefactorResult';

function formatCellValue(value: unknown) {
    if (typeof value === 'number') {
        return value.toFixed(2);
    }

    return formatWithOptions({ colors: true }, value);
}

function formatDiffNumbers(
    first: number,
    second: number,
    type: 'more-is-better' | 'less-is-better'
) {
    if (Math.abs(first - second) < 0.0001) {
        return '';
    }

    const value =
        first > 1 && second > 1
            ? (Math.abs(first - second) / second) * 100
            : Math.abs(first - second) * 100;
    const sign = first > second ? '+' : '-';
    const diff = `${sign}${value.toFixed(2)}%`;

    const color =
        type === 'less-is-better'
            ? sign === '+'
                ? 'red'
                : 'green'
            : sign === '-'
              ? 'red'
              : 'green';

    if (color === 'red') {
        return chalk.red(diff);
    } else {
        return chalk.green(diff);
    }
}

type SummaryKeys = keyof Awaited<ReturnType<typeof summarizeRefactorResult>>;

const typeByKey: Partial<
    Record<SummaryKeys, 'more-is-better' | 'less-is-better'>
> = {
    acceptedRatio: 'more-is-better',
    durationMs: 'less-is-better',
    score: 'more-is-better',
    totalTokens: 'less-is-better',
    totalPromptTokens: 'less-is-better',
    totalCompletionTokens: 'less-is-better',
    wastedTokensRatio: 'less-is-better',
};

function formatDiff(key: SummaryKeys, first: unknown, second: unknown) {
    const type = typeByKey[key];

    if (typeof first !== 'number' || typeof second !== 'number' || !type) {
        return '';
    }

    return formatDiffNumbers(first, second, type);
}

function formatAsTable<T extends object>(list: T[]) {
    if (!hasOneElement(list)) {
        return '';
    }

    const keys = Object.keys(list[0]) as Array<keyof T>;

    const header = keys.join(' | ');
    const hr = keys.map(() => '---').join(' | ');

    const table = list
        .map((item) => keys.map((key) => formatCellValue(item[key])))
        .map((row) => row.join(' | '))
        .join('\n');

    return [header, hr, table].join('\n');
}

export async function reportBenchmarkSummary(opts: {
    summaries: Array<{
        variant: string;
        summary: Awaited<ReturnType<typeof summarizeRefactorResult>>;
    }>;
}) {
    const keys = opts.summaries
        .map(({ summary }) => Object.keys(summary) as SummaryKeys[])[0]
        ?.filter((key) => !['outliers', 'lowScores'].includes(key));

    assert(keys !== undefined);

    assert(keys.length > 0);

    const benchmarkSummary = keys.map((key) => ({
        metric: key,
        ...Object.fromEntries(
            opts.summaries.map(({ variant, summary }) => [
                variant,
                formatCellValue(summary[key]),
            ])
        ),
        ...(hasTwoElements(opts.summaries) && {
            diff: formatDiff(
                key,
                opts.summaries[1].summary[key],
                opts.summaries[0].summary[key]
            ),
        }),
    }));

    const outliers = opts.summaries.flatMap(({ variant, summary }) => {
        const { outliers } = summary;

        const outlierKeys = Object.keys(outliers) as Array<
            keyof typeof outliers
        >;

        if (outlierKeys.length === 0) {
            return [];
        }

        const keysByResultFilePath = new Map<
            string,
            Record<(typeof outlierKeys)[number], number>
        >();

        for (const outlierKey of outlierKeys) {
            for (const outlier of outliers[outlierKey]) {
                const resultFilePath = relative(
                    process.cwd(),
                    outlier.result.resultFilePath
                );

                const record =
                    keysByResultFilePath.get(resultFilePath) ||
                    ({} as Record<(typeof outlierKeys)[number], number>);

                if (outlierKey in outlier) {
                    const value = (outlier as Record<string, unknown>)[
                        outlierKey
                    ];

                    if (typeof value === 'number') {
                        record[outlierKey] = value;
                        keysByResultFilePath.set(resultFilePath, record);
                    }
                }
            }
        }

        if (keysByResultFilePath.size === 0) {
            return [];
        }

        return {
            variant,
            outliers: [...keysByResultFilePath.entries()].map(
                ([filePath, values]) => ({
                    filePath,
                    ...values,
                })
            ),
        };
    });

    const lowScores = opts.summaries
        .filter(({ summary }) => summary.lowScores.length > 0)
        .map(({ variant, summary }) => ({
            variant,
            lowScores: summary.lowScores.map((lowScoreSummary) => ({
                score: lowScoreSummary.score,
                resultFilePath: relative(
                    process.cwd(),
                    lowScoreSummary.result.resultFilePath
                ),
            })),
        }));

    await printMarkdown(
        format(
            markdown`
                # Benchmark results

                %results%

                All columns averaged over \`numberOfRuns\`.

                \`score\` - outcome based metric from 0 to 1 where 1 represents
                an outcome where every explicit requirement is satisfied and 0
                represents failed refactor

                \`acceptedRatio\` - ratio of number of files that were accepted
                as a result of the refactor to the total number of files that
                were changed

                \`wastedTokensRatio\` - number of tokens that were exchanged
                with LLM, which produced an outcome that was later discarded

                %outliers%

                %lowScores%
            `,
            {
                results: formatAsTable(benchmarkSummary),
                outliers: formatOptional({
                    text:
                        outliers.length > 0
                            ? formatFencedCodeBlock({
                                  code: dump(outliers),
                              })
                            : '',
                    heading: '# Outliers',
                }),
                lowScores: formatOptional({
                    text:
                        lowScores.length > 0
                            ? formatFencedCodeBlock({
                                  code: dump(lowScores),
                              })
                            : '',
                    heading: '# Low Scores',
                }),
            }
        )
    );
}

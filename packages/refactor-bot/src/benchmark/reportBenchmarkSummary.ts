import assert from 'assert';
import { formatWithOptions } from 'util';

import { markdown, printMarkdown } from '../markdown/markdown';
import { format } from '../text/format';
import { lowerCamelCaseToKebabCase } from '../utils/lowerCamelCaseToKebabCase';
import type { summarizeRefactorResult } from './summarizeRefactorResult';

function formatColumn(_: string, column: unknown) {
    if (typeof column === 'number') {
        return column.toFixed(2);
    }

    return formatWithOptions({ colors: true }, '%O', column);
}

export async function reportBenchmarkSummary(opts: {
    summaries: Array<{
        variant: string;
        summary: Awaited<ReturnType<typeof summarizeRefactorResult>>;
    }>;
}) {
    const keys = opts.summaries.map(({ summary }) => Object.keys(summary))[0];
    assert(keys !== undefined);
    assert(keys.length > 0);

    const header = [
        'variant',
        ...keys.map((key) => lowerCamelCaseToKebabCase(key)),
    ].join(' | ');
    const header2 = ['---', '---', ...keys.map(() => '---')].join(' | ');
    const table = opts.summaries
        .map(({ variant, summary }) =>
            [
                variant,
                ...keys.map((key) =>
                    formatColumn(key, (summary as Record<string, unknown>)[key])
                ),
            ].join(' | ')
        )
        .join('\n');

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
            `,
            {
                results: [header, header2, table].join('\n'),
            }
        )
    );
}

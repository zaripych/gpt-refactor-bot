import assert from 'node:assert';

import { z } from 'zod';

import { spawnResult } from '../child-process/spawnResult';
import { makeFunction } from '../functions/makeFunction';
import type { FunctionsConfig } from '../functions/types';
import { line } from '../text/line';

const max = 1_000;

const command = [`git`, `grep`, `-n`] as const;

const searchArgsSchema = z.object({
    text: z.string().describe(`Text to search for in files`),
    patterns: z.array(z.string()).optional().describe(line`
        Glob patterns for directories and files to look at. When not
        specified - will lookup for all files and directories at the root of
        the repository.
    `),
    max: z.number().optional().default(max).describe(line`
        Maximum number of results to return to the caller.
        Defaults to ${max}.
    `),
});

const searchResultSchema = z.array(
    z.object({
        filePath: z
            .string()
            .describe(`Path to the file where the text was found`),
        results: z
            .array(
                z.object({
                    line: z
                        .number()
                        .describe(`Line number where the text was found`),
                    excerpt: z.string().describe(`Line containing the text`),
                })
            )
            .describe(`List of lines where the text was found`),
    })
);

export const search = async (
    input: z.output<typeof searchArgsSchema>,
    config: FunctionsConfig
) => {
    const { max, patterns } = input;

    const result = await spawnResult(
        command[0],
        [
            ...command.slice(1),
            input.text,
            `--`,
            ...(patterns || []).map((p) => `:(glob)${p}`),
        ],
        {
            exitCodes: [0],
            cwd: config.repositoryRoot,
        }
    );

    if (result.status !== 0) {
        if (result.stderr) {
            throw new Error(result.stderr);
        }
    }

    const results = result.stdout.trim().split('\n').splice(0, max);

    const regex = new RegExp(`^([^:\n]+):([0-9]+):(.*)$`);

    const groupedResults = results.reduce(
        (acc, outputLine) => {
            const match = outputLine.match(regex);

            if (!match) {
                return acc;
            }

            const [, filePath, line, excerpt] = match;

            assert(filePath);
            assert(line);
            assert(excerpt);

            const fileResults = acc.get(filePath) || {
                filePath,
                results: [],
            };

            fileResults.results.push({
                line: Number.parseInt(line, 10),
                excerpt,
            });

            acc.set(filePath, fileResults);

            return acc;
        },
        new Map<
            string,
            {
                filePath: string;
                results: Array<{ line: number; excerpt: string }>;
            }
        >()
    );

    return [...groupedResults.values()];
};

export const searchFunction = makeFunction({
    name: 'search',
    argsSchema: searchArgsSchema,
    resultSchema: searchResultSchema.describe(line`
        Search results, limited to max lines
    `),
    implementation: search,
    description: line`
        Searches the repository contents for the given text. The number of
        results returned is limited by a parameter. Contents of the .git/
        directory along with other files matching .gitignore-listed patterns are
        not included.
    `,
});

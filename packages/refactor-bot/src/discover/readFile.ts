import { readFile } from 'fs/promises';
import { join } from 'path';
import { z } from 'zod';

import { makeFunction } from '../functions/makeFunction';
import type { FunctionsConfig } from '../functions/types';
import { line } from '../text/line';

const readFileArgsSchema = z.object({
    filePath: z
        .string()
        .describe(`Path to the file relative to the repository root`),
});

export const readFileFunction = makeFunction({
    name: 'readFile',
    description: `Read contents of a file`,
    argsSchema: readFileArgsSchema,
    resultSchema: z.string().describe(line`
        Contents of the file
    `),
    implementation: async (
        input: z.output<typeof readFileArgsSchema>,
        config: FunctionsConfig
    ) => {
        return await readFile(
            join(config.repositoryRoot, input.filePath),
            'utf-8'
        );
    },
});

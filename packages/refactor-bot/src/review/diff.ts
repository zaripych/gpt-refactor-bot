import { z } from 'zod';

import { makeFunction } from '../functions/makeFunction';
import { gitFilesDiff } from '../git/gitFilesDiff';
import { markdown } from '../markdown/markdown';

export const diffFunction = makeFunction({
    argsSchema: z.object({
        filePaths: z
            .array(z.string())
            .optional()
            .describe('File paths to to return diff for'),
        nameOnly: z
            .boolean()
            .optional()
            .describe(
                'Return only names of changed files, without diff content'
            ),
        ref: z
            .string()
            .optional()
            .default('HEAD')
            .describe('Target ref, defaults to HEAD'),
    }),
    resultSchema: z.string().describe('git diff output'),
    name: 'diff',
    description: markdown`
        Returns a diff between the current working tree and the target ref,
        optionally filtered by file path. Please note that this function can
        return a large amount of data, it makes sense to use "nameOnly" to limit
        the output to file names only at first and then proceed based on the
        result.
    `,
    implementation: async (args, config) => {
        return await gitFilesDiff({
            location: config.repositoryRoot,
            filePaths: args.filePaths,
            ref: args.ref,
            nameOnly: args.nameOnly,
        });
    },
});

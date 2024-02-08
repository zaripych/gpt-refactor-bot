import { readFile } from 'fs/promises';
import { z } from 'zod';

import { makeFunction } from '../functions/makeFunction';
import { markdown } from '../markdown/markdown';
import { prettierTypescript } from '../prettier/prettier';
import { isFileNotFoundError } from '../utils/isFileNotFoundError';
import { applyFindAndReplace } from './applyFindAndReplace';
import { FunctionsConfig, functionsConfigSchema } from '../functions/types';
import { join } from 'path';

const argsSchema = z.object({
    filePath: z
        .string()
        .describe(
            'The file path to make changes to, relative to the repository root'
        ),
    changes: z
        .array(
            z.union([
                z.object({
                    find: z
                        .string()
                        .describe('The text to find in the file, must exist'),
                    replace: z
                        .string()
                        .describe(
                            'The text to replace the found text with, can be empty'
                        ),
                    occurrence: z
                        .number()
                        .optional()
                        .describe(
                            'The occurrence to replace, starts from 0, if not specified, defaults to 0'
                        ),
                }),
                z.object({
                    findAll: z
                        .string()
                        .describe(
                            'The text to find in the file, must exist, will result in all occurrences being replaced'
                        ),
                    replace: z
                        .string()
                        .describe(
                            'The text to replace the found text with, can be empty'
                        ),
                }),
            ])
        )
        .describe('A non-empty array of text-replacement operations')
        .nonempty(),
});

const resultSchema = z.object({
    issues: z.array(
        z.object({
            issue: z.string().describe('The issue found'),
            filePath: z
                .string()
                .describe(
                    'The file path of where the issue has been found, relative to the repository root'
                ),
        })
    ),
});

type Args = z.output<typeof argsSchema>;

type Results = z.output<typeof resultSchema>;

const configSchema = functionsConfigSchema.augment({
    eslintAutoFixScriptArgs: z.array(z.string()).nonempty().optional(),
    prettierScriptLocation: z.string().optional(),
})

export async function tryChanges(args: Args, config: FunctionsConfig): Promise<Results> {
    try {
        const filePath = join(config.repositoryRoot, args.filePath);

        const fileContents = await readFile(filePath, 'utf-8');

        const modifiedContents = applyFindAndReplace({
            text: fileContents,
            blocks: args.changes,
        });

        const formattedModifiedContents = await prettierTypescript({
            prettierScriptLocation: config.prettierScriptLocation,
            filePath,
            ts: result,
            throwOnParseError: true,
        });

        const autoFixedIssues = await config.
    } catch (err) {
        if (isFileNotFoundError(err)) {
            throw new Error(
                `File at "${args.filePath}" cannot be found, please specify path relative to the repository root, try searching for the file if unsure`
            );
        }
        throw err;
    }
}

export const tryChangesFunction = makeFunction({
    argsSchema,
    resultSchema,
    name: 'tryChanges',
    description: markdown`
        Make changes to the source code to see if they lead to any errors. The
        changes are immediately reverted after the checks are done.
    `,
    implementation: tryChanges,
});

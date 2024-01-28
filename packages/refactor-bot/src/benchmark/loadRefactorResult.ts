import { readFile } from 'fs/promises';
import { load } from 'js-yaml';
import { z } from 'zod';

import { ConfigurationError } from '../errors/configurationError';
import { line } from '../text/line';
import { isFileNotFoundError } from '../utils/isFileNotFoundError';
import { refactorResultSchema } from './refactorResultSchema';

export type LoadedRefactorResult = NonNullable<
    Awaited<ReturnType<typeof loadRefactorResult>>
>;

export async function loadRefactorResult(opts: { resultFilePath: string }) {
    try {
        return {
            ...refactorResultSchema.parse(
                load(await readFile(opts.resultFilePath, 'utf-8'))
            ),
            resultFilePath: opts.resultFilePath,
        };
    } catch (err) {
        if (isFileNotFoundError(err)) {
            return undefined;
        }

        if (err instanceof z.ZodError) {
            throw new ConfigurationError(
                line`
                    Failed to parse result of the refactor at 
                    "${opts.resultFilePath}" - when the schema changes
                    re-evaluating the refactor results
                    will not be possible
                `,
                {
                    cause: err,
                }
            );
        }

        throw err;
    }
}

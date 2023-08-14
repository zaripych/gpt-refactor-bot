import { writeFile } from 'fs/promises';
import { join } from 'path';
import type { z } from 'zod';

import { autoFixIssues } from '../eslint/autoFixIssues';
import { gitAdd } from '../git/gitAdd';
import { gitCommit } from '../git/gitCommit';
import { gitRevParse } from '../git/gitRevParse';
import { logger } from '../logger/logger';
import type { scriptSchema } from './types';

export async function applyChanges(opts: {
    sandboxDirectoryPath: string;
    filePath: string;
    fileContents: string;
    fileContentsHash?: string;
    scripts?: Array<z.input<typeof scriptSchema>>;
    commitMessage: string;
}) {
    const { sandboxDirectoryPath, filePath, fileContents, fileContentsHash } =
        opts;

    if (fileContentsHash) {
        logger.info('Writing to file at', [filePath], ', with contents hash', [
            fileContentsHash,
        ]);
    } else {
        logger.info('Writing to file at', [filePath]);
    }

    await writeFile(join(sandboxDirectoryPath, filePath), fileContents);

    if (opts.scripts) {
        const eslintScript = opts.scripts.find((script) =>
            script.args.includes('eslint')
        );
        if (eslintScript) {
            logger.debug('Running eslint --fix on', [filePath]);
            await autoFixIssues({
                eslintScriptArgs: eslintScript.args,
                filePaths: [filePath],
                location: sandboxDirectoryPath,
            });
        }
    }

    await gitAdd({
        location: sandboxDirectoryPath,
        filePath,
    });

    await gitCommit({
        location: sandboxDirectoryPath,
        message: opts.commitMessage,
    });

    const commit = await gitRevParse({
        location: sandboxDirectoryPath,
        ref: 'HEAD',
    });

    logger.info('Committed', [commit]);

    return {
        commit,
    };
}

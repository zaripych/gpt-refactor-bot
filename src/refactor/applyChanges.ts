import { writeFile } from 'fs/promises';
import { join } from 'path';

import { gitAdd } from '../git/gitAdd';
import { gitCommit } from '../git/gitCommit';
import { gitRevParse } from '../git/gitRevParse';
import { logger } from '../logger/logger';

export async function applyChanges(opts: {
    sandboxDirectoryPath: string;
    filePath: string;
    fileContents: string;
    fileContentsHash?: string;
    commitMessage: string;
}) {
    const { sandboxDirectoryPath, filePath, fileContents, fileContentsHash } =
        opts;

    if (fileContentsHash) {
        logger.debug(
            'Writing to file at',
            filePath,
            ', with contents hash',
            fileContentsHash
        );
    } else {
        logger.debug('Writing to file at', filePath);
    }

    await writeFile(join(sandboxDirectoryPath, filePath), fileContents);

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

    logger.info('Committed', commit);

    return {
        commit,
    };
}

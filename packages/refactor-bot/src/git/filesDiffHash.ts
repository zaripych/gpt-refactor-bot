import hash from 'object-hash';

import { logger } from '../logger/logger';
import { gitFilesDiff } from './gitFilesDiff';

export async function filesDiffHash(opts: {
    location: string;
    ref: string;
    filePaths: string[];
}) {
    const filesDiff = await gitFilesDiff({
        location: opts.location,
        ref: opts.ref,
        filePaths: opts.filePaths,
    });
    const filesDiffHash = hash(filesDiff);
    logger.trace('Files diff hash', {
        ...opts,
        filesDiffHash,
        filesDiff,
    });
    return {
        filesDiffHash,
    };
}

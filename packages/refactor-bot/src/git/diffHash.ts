import hash from 'object-hash';

import { logger } from '../logger/logger';
import { gitDiffAll } from './gitDiffAll';

export async function diffHash(opts: { location: string; ref: string }) {
    const diff = await gitDiffAll({
        location: opts.location,
        ref: opts.ref,
    });
    const diffHash = hash(diff);
    logger.trace('Diff hash', {
        ...opts,
        diffHash,
        diff,
    });
    return {
        diffHash,
    };
}

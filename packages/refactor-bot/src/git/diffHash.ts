import hash from 'object-hash';

import { gitDiffAll } from './gitDiffAll';

export async function diffHash(opts: { location: string; ref: string }) {
    return {
        diffHash: hash(
            await gitDiffAll({
                location: opts.location,
                ref: opts.ref,
            })
        ),
    };
}

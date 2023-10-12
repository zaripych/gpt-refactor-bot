import hash from 'object-hash';

import { gitFilesDiff } from './gitFilesDiff';

export async function filesDiffHash(opts: {
    location: string;
    ref: string;
    filePaths: string[];
}) {
    return {
        filesDiffHash: hash(
            await gitFilesDiff({
                location: opts.location,
                ref: opts.ref,
                filePaths: opts.filePaths,
            })
        ),
    };
}

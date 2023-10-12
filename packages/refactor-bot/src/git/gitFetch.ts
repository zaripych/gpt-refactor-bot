import { spawnResult } from '../child-process/spawnResult';

export async function gitFetch(opts: {
    location: string;
    from: string;
    refs: [string, ...string[]];
}) {
    await spawnResult('git', ['fetch', opts.from, ...opts.refs], {
        cwd: opts.location,
        exitCodes: [0],
        logOnError: 'stderr',
    });
}

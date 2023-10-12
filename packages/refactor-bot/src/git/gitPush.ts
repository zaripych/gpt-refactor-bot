import { spawnResult } from '../child-process/spawnResult';

export async function gitPush(opts: { location: string }) {
    await spawnResult('git', ['push', 'origin'], {
        cwd: opts.location,
        exitCodes: [0],
        logOnError: 'stderr',
    });
}

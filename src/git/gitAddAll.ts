import { spawnResult } from '../child-process/spawnResult';

export async function gitAddAll(opts: { location: string }) {
    await spawnResult('git', ['add', '.'], {
        cwd: opts.location,
        exitCodes: [0],
        logOnError: 'stderr',
    });
}

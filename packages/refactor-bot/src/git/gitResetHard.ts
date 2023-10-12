import { spawnResult } from '../child-process/spawnResult';

export async function gitResetHard(opts: { location: string; ref: string }) {
    await spawnResult('git', ['reset', opts.ref, '--hard'], {
        cwd: opts.location,
        exitCodes: [0],
        logOnError: 'stderr',
    });
}

import { spawnResult } from '../child-process/spawnResult';

export async function gitDiffAll(opts: { location: string; ref: string }) {
    const { stdout } = await spawnResult('git', ['diff', opts.ref], {
        cwd: opts.location,
        exitCodes: [0],
        logOnError: 'stderr',
    });
    return stdout;
}

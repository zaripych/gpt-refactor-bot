import { spawnResult } from '../child-process/spawnResult';

export async function gitAdd(opts: { location: string; filePath: string }) {
    await spawnResult('git', ['add', opts.filePath], {
        cwd: opts.location,
        exitCodes: [0],
        logOnError: 'stderr',
    });
}

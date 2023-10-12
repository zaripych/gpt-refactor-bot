import { spawnResult } from '../child-process/spawnResult';

export async function gitRevParse(opts: { location: string; ref: string }) {
    const { stdout } = await spawnResult('git', ['rev-parse', opts.ref], {
        cwd: opts.location,
        exitCodes: [0],
        logOnError: 'stderr',
    });
    return stdout.trim();
}

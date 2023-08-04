import { spawnResult } from '../child-process/spawnResult';

export async function gitCurrentBranch(opts: { location: string }) {
    const { stdout } = await spawnResult('git', ['branch', '--show-current'], {
        cwd: opts.location,
        exitCodes: [0],
        logOnError: 'stderr',
    });
    return stdout.trim() || undefined;
}

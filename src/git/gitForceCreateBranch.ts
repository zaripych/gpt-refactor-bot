import { spawnResult } from '../child-process/spawnResult';

export async function gitForceCreateBranch(opts: {
    location: string;
    branchName: string;
    ref: string;
}) {
    await spawnResult('git', ['branch', '-f', opts.branchName, opts.ref], {
        cwd: opts.location,
        exitCodes: [0],
        logOnError: 'stderr',
    });
}

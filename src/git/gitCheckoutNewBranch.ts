import { spawnResult } from '../child-process/spawnResult';

export async function gitCheckoutNewBranch(opts: {
    location: string;
    branchName: string;
}) {
    await spawnResult('git', ['checkout', '-B', opts.branchName], {
        cwd: opts.location,
        exitCodes: [0],
        logOnError: 'stderr',
    });
}

import { spawnResult } from '../child-process/spawnResult';

export async function gitClone(opts: {
    repository: string;
    cloneDestination: string;
    ref: string;
}) {
    const { repository, cloneDestination, ref } = opts;
    await spawnResult('git', ['clone', repository, cloneDestination], {
        exitCodes: [0],
        logOnError: 'stderr',
    });
    await spawnResult('git', ['checkout', ref], {
        exitCodes: [0],
        logOnError: 'stderr',
    });
}

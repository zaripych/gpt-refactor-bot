import { spawnResult } from '../child-process/spawnResult';
import { gitCheckout } from './gitCheckout';

export async function gitClone(opts: {
    repository: string;
    cloneDestination: string;
    ref?: string;
}) {
    const { repository, cloneDestination, ref } = opts;
    await spawnResult('git', ['clone', repository, cloneDestination], {
        exitCodes: [0],
        logOnError: 'stderr',
    });

    if (ref) {
        await gitCheckout({ location: cloneDestination, ref });
    }
}

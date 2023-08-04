import { spawnResult } from '../child-process/spawnResult';

export async function gitCheckout(opts: { location: string; ref: string }) {
    await spawnResult('git', ['checkout', opts.ref], {
        cwd: opts.location,
        exitCodes: [0],
        logOnError: 'stderr',
    });
}

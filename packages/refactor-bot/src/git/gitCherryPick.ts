import { spawnResult } from '../child-process/spawnResult';

export async function gitCherryPick(opts: {
    location: string;
    commit: string;
}) {
    await spawnResult('git', ['cherry-pick', opts.commit], {
        cwd: opts.location,
        exitCodes: [0],
        logOnError: 'combined',
    });
}

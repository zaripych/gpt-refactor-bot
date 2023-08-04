import type { SpawnResultReturn } from '../child-process/spawnResult';
import { spawnResult } from '../child-process/spawnResult';

export async function gitStatus(opts: { location: string }) {
    const { location } = opts;

    const split = (result: SpawnResultReturn) =>
        result.output.join('').split('\n').filter(Boolean);

    const listStaged = () =>
        spawnResult('git', 'diff --name-only --cached'.split(' '), {
            cwd: location,
            exitCodes: [0],
        }).then(split);

    const listModified = () =>
        spawnResult('git', 'diff --name-only'.split(' '), {
            cwd: location,
            exitCodes: [0],
        }).then(split);

    const listUntracked = () =>
        spawnResult(
            'git',
            'ls-files --others --exclude-standard --full-name'.split(' '),
            {
                cwd: location,
                exitCodes: [0],
            }
        ).then(split);

    const [staged, modified, untracked] = await Promise.all([
        listStaged(),
        listModified(),
        listUntracked(),
    ]);

    return {
        staged,
        modified,
        untracked,
    };
}

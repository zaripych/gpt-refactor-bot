import { spawnResult } from '../child-process/spawnResult';

export async function gitDefaultBranch(opts: { location: string }) {
    const gitRemote = await spawnResult('git', ['remote'], {
        cwd: opts.location,
        exitCodes: [0],
        logOnError: 'stderr',
    });
    const { stdout } = await spawnResult(
        'git',
        ['remote', 'show', gitRemote.stdout.trim()],
        {
            cwd: opts.location,
            exitCodes: [0],
            logOnError: 'stderr',
            env: {
                ...process.env,
                LC_ALL: 'C',
            },
        }
    );
    const [, defaultBranch] = /HEAD branch: (.*)/g.exec(stdout) || [];
    return defaultBranch;
}

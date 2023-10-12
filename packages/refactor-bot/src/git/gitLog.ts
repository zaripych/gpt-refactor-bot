import { spawnResult } from '../child-process/spawnResult';

export async function gitLog(opts: {
    location: string;
    start: string;
    stop: string;
}) {
    const { stdout } = await spawnResult(
        'git',
        ['log', `${opts.start}..${opts.stop}`, '--oneline'],
        {
            cwd: opts.location,
            exitCodes: [0],
            logOnError: 'stderr',
        }
    );
    return stdout.split('\n').filter(Boolean);
}

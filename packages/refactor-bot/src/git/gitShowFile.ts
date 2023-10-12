import { spawnResult } from '../child-process/spawnResult';

export async function gitShowFile(opts: {
    location: string;
    filePath: string;
    ref: string;
}) {
    const { stdout } = await spawnResult(
        'git',
        ['show', `${opts.ref}:${opts.filePath}`],
        {
            cwd: opts.location,
            exitCodes: [0],
            logOnError: 'stderr',
        }
    );
    return stdout;
}

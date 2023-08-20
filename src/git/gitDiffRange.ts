import { spawnResult } from '../child-process/spawnResult';

export async function gitDiffRange(opts: {
    location: string;
    filePaths: string[];
    startRef: string;
    endRef: string;
}) {
    const filePaths =
        typeof opts.filePaths === 'string' ? [opts.filePaths] : opts.filePaths;
    const { stdout } = await spawnResult(
        'git',
        ['diff', `${opts.startRef}..${opts.endRef}`, '--', ...filePaths],
        {
            cwd: opts.location,
            exitCodes: [0],
            logOnError: 'stderr',
        }
    );
    return stdout;
}

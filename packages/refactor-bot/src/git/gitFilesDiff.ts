import { spawnResult } from '../child-process/spawnResult';

export async function gitFilesDiff(opts: {
    location: string;
    filePaths?: string[];
    nameOnly?: boolean;
    ref: string;
}) {
    const filePaths =
        typeof opts.filePaths === 'string' ? [opts.filePaths] : opts.filePaths;
    const { stdout } = await spawnResult(
        'git',
        [
            'diff',
            opts.ref,
            opts.nameOnly ? '--name-only' : '',
            '--',
            ...(filePaths ?? []),
        ].filter(Boolean),
        {
            cwd: opts.location,
            exitCodes: [0],
            logOnError: 'stderr',
        }
    );
    return stdout;
}

import { spawnResult } from '../child-process/spawnResult';

export async function runPackageManagerScript(opts: {
    packageManager: 'npm' | 'yarn' | 'pnpm';
    script: string;
    args?: string[];
    location: string;
    logOnError?: 'stdout' | 'stderr' | 'combined';
}) {
    return await spawnResult(
        opts.packageManager,
        [opts.script, ...(opts.args || [])],
        {
            cwd: opts.location,
            exitCodes: [0],
            logOnError: opts.logOnError ?? 'combined',
            env: {
                ...process.env,
                LOG_LEVEL: 'error',
            },
        }
    );
}

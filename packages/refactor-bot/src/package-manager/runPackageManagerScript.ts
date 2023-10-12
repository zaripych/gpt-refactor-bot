import { spawnResult } from '../child-process/spawnResult';

export async function runPackageManagerScript(opts: {
    packageManager: 'npm' | 'yarn' | 'pnpm';
    script: string;
    args?: string[];
    location: string;
    logOnError?: 'stdout' | 'stderr' | 'combined';
}) {
    let extras: string[];
    switch (opts.packageManager) {
        case 'yarn':
            extras = ['--silent', 'exec', '--'];
            break;
        case 'npm':
            extras = ['--quiet', 'exec', '--'];
            break;
        case 'pnpm':
            extras = ['--silent', 'exec', '--'];
            break;
    }

    return await spawnResult(
        opts.packageManager,
        [...extras, opts.script, ...(opts.args || [])],
        {
            cwd: opts.location,
            exitCodes: 'any',
            logOnError: opts.logOnError ?? 'combined',
            env: {
                ...process.env,
                LOG_LEVEL: 'error',
            },
        }
    );
}

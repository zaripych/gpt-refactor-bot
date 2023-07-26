import { spawnResult } from '../child-process/spawnResult';
import { UnreachableError } from '../utils/UnreachableError';

export async function installDependencies(opts: {
    packageManager: 'yarn' | 'pnpm' | 'npm';
    directory: string;
}) {
    switch (opts.packageManager) {
        case 'pnpm':
            await spawnResult('pnpm', ['install'], {
                cwd: opts.directory,
                logOnError: 'combined',
                exitCodes: [0],
            });
            break;
        case 'npm':
            await spawnResult('npm', ['install'], {
                cwd: opts.directory,
                logOnError: 'combined',
                exitCodes: [0],
            });
            break;
        case 'yarn':
            await spawnResult('yarn', ['install'], {
                cwd: opts.directory,
                logOnError: 'combined',
                exitCodes: [0],
            });
            break;
        default:
            throw new UnreachableError(opts.packageManager);
    }
}

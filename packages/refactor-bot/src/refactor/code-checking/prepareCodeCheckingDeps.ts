import type { CacheStateRef } from '../../cache/types';
import { ConfigurationError } from '../../errors/configurationError';
import { determinePackageManager } from '../../package-manager/determinePackageManager';
import type { RefactorConfig } from '../types';
import { check, checkScriptsFromConfig } from './check';
import { discoverCheckDependencies } from './discoverDependencies';

export type CodeCheckingDeps = Awaited<
    ReturnType<typeof prepareCodeCheckingDeps>
>;

export async function prepareCodeCheckingDeps(
    opts: {
        location: string;
        startCommit: string;
    } & Pick<RefactorConfig, 'tsc' | 'eslint' | 'jest'>
) {
    const checks = await discoverCheckDependencies({
        location: opts.location,
    });

    if (!checks.tsc) {
        throw new ConfigurationError(
            `Cannot find TypeScript dependencies in the repository, ` +
                ` The refactor bot only supports TypeScript at the moment`
        );
    }

    const packageManager = await determinePackageManager({
        directory: opts.location,
    });

    const scripts = checkScriptsFromConfig(opts, checks);

    return {
        scripts,
        packageManager,

        check: async (params?: { filePaths?: string[] }, ctx?: CacheStateRef) =>
            check(
                {
                    ...opts,
                    ...params,
                    packageManager,
                    scripts,
                },
                ctx
            ),
    };
}

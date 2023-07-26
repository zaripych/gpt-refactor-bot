import { z } from 'zod';

import { spawnResult } from '../child-process/spawnResult';
import { gitClone } from '../git/gitClone';
import { determinePackageManager } from '../package-manager/determinePackageManager';
import { installDependencies } from '../package-manager/installDependencies';
import { createSandbox, sandboxLocation } from '../sandbox/createSandbox';
import { makeDependencies } from './dependencies';
import type { RefactorConfig } from './types';

export const checkoutSandboxResultSchema = z.object({
    sandboxDirectoryPath: z.string(),
});

export async function checkoutSandbox(
    config: RefactorConfig,
    getDeps = makeDependencies
) {
    const { logger, findRepositoryRoot } = getDeps();

    const root = await findRepositoryRoot();

    const { sandboxId, sandboxDirectoryPath } = sandboxLocation({
        tag: config.name,
    });

    if (config.repository) {
        logger.debug(`Cloning "${config.repository}"`);

        await gitClone({
            repository: config.repository,
            cloneDestination: sandboxDirectoryPath,
            ref: config.ref,
        });
    } else {
        logger.debug(`Creating sandbox from "${root}"`);

        /**
         * @todo: this might copy some files that might be
         * sensitive, we should probably introduce a way to
         * ignore some files (ie .env)
         */
        await createSandbox({
            tag: config.name,
            source: root,
            sandboxId,
        });
    }

    const packageManager = await determinePackageManager({
        directory: sandboxDirectoryPath,
    });

    await installDependencies({
        directory: sandboxDirectoryPath,
        packageManager,
    });

    if (config.bootstrapScripts) {
        await config.bootstrapScripts.reduce(async (previous, script) => {
            await previous;

            await spawnResult(packageManager, ['run', script], {
                cwd: sandboxDirectoryPath,
                exitCodes: [0],
                logOnError: 'combined',
            });
        }, Promise.resolve());
    }

    return {
        sandboxDirectoryPath,
    };
}

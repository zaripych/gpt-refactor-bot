import { z } from 'zod';

import { makeCachedFunction } from '../cache/makeCachedFunction';
import { ConfigurationError } from '../errors/configurationError';
import { findRepositoryRoot } from '../file-system/findRepositoryRoot';
import { changedFilesHash } from '../git/changedFilesHash';
import { gitAddAll } from '../git/gitAddAll';
import { gitClone } from '../git/gitClone';
import { gitCommit } from '../git/gitCommit';
import { gitCurrentBranch } from '../git/gitCurrentBranch';
import { gitDefaultBranch } from '../git/gitDefaultBranch';
import { gitResetHard } from '../git/gitResetHard';
import { gitRevParse } from '../git/gitRevParse';
import { gitStatus } from '../git/gitStatus';
import { logger } from '../logger/logger';
import { determinePackageManager } from '../package-manager/determinePackageManager';
import { installDependencies } from '../package-manager/installDependencies';
import { runPackageManagerScript } from '../package-manager/runPackageManagerScript';
import { createSandbox, sandboxLocation } from '../sandbox/createSandbox';
import { format } from '../text/format';
import { line } from '../text/line';
import { checkoutAndSandboxSchema } from './types';

async function ensureCreateSandboxIsCompatibleWithOtherProps<
    T extends z.output<typeof checkoutAndSandboxSchema>,
>(input: T) {
    if (input.createSandbox) {
        return input;
    }

    const root = await findRepositoryRoot(input.location);

    if (input.ref) {
        const changes = await changedFilesHash({
            location: root,
        });

        if (changes) {
            throw new ConfigurationError(
                format(
                    line`
                        We cannot checkout a ref "%ref%" in "%root%" directory without
                        loosing the changes in the working tree. Please commit or stash
                        the changes and try again. 
                    `,
                    { ref: input.ref, root }
                )
            );
        }
    }

    return input;
}

async function addChangedFilesHash<
    T extends z.output<typeof checkoutAndSandboxSchema>,
>(input: T) {
    const newLocation = await findRepositoryRoot(input.location);

    if (input.ref) {
        return {
            ...input,
            location: newLocation,
        };
    }

    return {
        ...input,
        location: newLocation,
        ...(await changedFilesHash({
            location: newLocation,
        })),
    };
}

export const checkoutSandboxInputSchema = checkoutAndSandboxSchema
    .augment({
        commitDirtyWorkingTree: z.boolean().default(true),
        installDependencies: z.boolean().default(true),
    })
    .transform(async (input) => {
        return addChangedFilesHash(
            await ensureCreateSandboxIsCompatibleWithOtherProps(input)
        );
    });

export const checkoutSandboxResultSchema = z.object({
    startCommit: z.string(),
    originalBranch: z.string().optional(),
    defaultBranch: z.string().optional(),
    sandboxDirectoryPath: z.string(),
});

async function createSandboxOrUseLocation(
    config: z.output<typeof checkoutSandboxInputSchema>
) {
    if (!config.createSandbox) {
        return {
            sandboxId: config.id,
            sandboxDirectoryPath: config.location,
        };
    }

    const { sandboxId, sandboxDirectoryPath } = sandboxLocation({
        tag: config.name,
        sandboxId: config.id,
    });

    if (config.repository) {
        logger.trace(`Cloning "${config.repository}"`);

        await gitClone({
            repository: config.repository,
            cloneDestination: sandboxDirectoryPath,
            ref: config.ref,
        });
    } else {
        logger.trace(`Creating sandbox from "${config.location}"`);

        await createSandbox({
            tag: config.name,
            source: config.location,
            sandboxId,
            ignore: config.ignore,
            ignoreFiles: config.ignoreFiles,
        });

        if (config.ref) {
            await gitAddAll({
                location: sandboxDirectoryPath,
            });
            await gitResetHard({
                location: sandboxDirectoryPath,
                ref: config.ref,
            });
        }
    }

    return {
        sandboxId,
        sandboxDirectoryPath,
    };
}

export const checkoutSandbox = makeCachedFunction({
    name: 'checkout-sandbox',
    inputSchema: checkoutSandboxInputSchema,
    resultSchema: checkoutSandboxResultSchema,
    transform: async (config) => {
        const { sandboxDirectoryPath } =
            await createSandboxOrUseLocation(config);

        const status = await gitStatus({
            location: sandboxDirectoryPath,
        });

        if (Object.values(status).some((files) => files.length > 0)) {
            if (!config.allowDirtyWorkingTree) {
                throw new ConfigurationError(line`
                    Sandbox has non-committed files, please  set  
                    allowDirtyWorkingTree to ignore this and continue. Running
                    with dirty working tree will lead to non deterministic
                    results even when refactor is run multiple times with the
                    same "id".
                `);
            }

            if (config.commitDirtyWorkingTree) {
                logger.warn(line`
                    **WARNING** Sandbox has non-committed files. We are going to
                    commit those files to ensure that the sandbox is in a clean
                    state before refactor. Before pushing the changes, please make
                    sure that the changes do not contain any sensitive information.
                `);

                await gitAddAll({
                    location: sandboxDirectoryPath,
                });

                await gitCommit({
                    location: sandboxDirectoryPath,
                    message: line`
                        chore: cleanup before refactor - committing modified changes
                        that are not part of the refactor
                    `,
                });
            }
        }

        const branch = await gitCurrentBranch({
            location: sandboxDirectoryPath,
        });

        const refactorStartCommit = await gitRevParse({
            location: sandboxDirectoryPath,
            ref: 'HEAD',
        });

        const defaultBranch = await gitDefaultBranch({
            location: sandboxDirectoryPath,
        }).catch((error) => {
            logger.warn('Cannot determine default branch', error);
            return Promise.resolve(undefined);
        });

        const packageManager = await determinePackageManager({
            directory: sandboxDirectoryPath,
        });

        if (config.installDependencies) {
            logger.debug(
                `Installing dependencies in ${sandboxDirectoryPath} using ${packageManager}`
            );
            await installDependencies({
                directory: sandboxDirectoryPath,
                packageManager,
            });
        }

        if (config.bootstrapScripts) {
            await config.bootstrapScripts.reduce(async (previous, script) => {
                await previous;

                await runPackageManagerScript({
                    packageManager,
                    script,
                    location: sandboxDirectoryPath,
                });
            }, Promise.resolve());
        }

        return {
            startCommit: refactorStartCommit,
            originalBranch: branch,
            defaultBranch,
            sandboxDirectoryPath,
        };
    },
});

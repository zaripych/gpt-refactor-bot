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
import { ensureTruthy } from '../utils/isTruthy';
import { refactorConfigSchema } from './types';

export const checkoutSandboxInputSchema = refactorConfigSchema
    .pick({
        id: true,
        name: true,
        repository: true,
        ref: true,
        bootstrapScripts: true,
        allowDirtyWorkingTree: true,
        ignore: true,
        ignoreFiles: true,
    })
    .transform(async (input) => {
        if (!input.repository && !input.ref) {
            const root = await findRepositoryRoot();
            return {
                ...input,
                ...(await changedFilesHash({
                    location: root,
                })),
            };
        }

        return {
            ...input,
            changedFilesHash: undefined,
        };
    });

export const checkoutSandboxResultSchema = z.object({
    startCommit: z.string(),
    originalBranch: z.string().optional(),
    defaultBranch: z.string(),
    sandboxDirectoryPath: z.string(),
});

export const checkoutSandbox = makeCachedFunction({
    name: 'checkout-sandbox',
    inputSchema: checkoutSandboxInputSchema,
    resultSchema: checkoutSandboxResultSchema,
    transform: async (config) => {
        const root = await findRepositoryRoot();

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
            logger.trace(`Creating sandbox from "${root}"`);

            await createSandbox({
                tag: config.name,
                source: root,
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

        const status = await gitStatus({
            location: sandboxDirectoryPath,
        });

        if (Object.values(status).some((files) => files.length > 0)) {
            if (!config.allowDirtyWorkingTree) {
                throw new ConfigurationError(
                    `Sandbox has non-committed files, please set ` +
                        `allowDirtyWorkingTree to ignore this and continue. ` +
                        `Running with dirty working tree will lead to non ` +
                        `deterministic results even when refactor is run ` +
                        `multiple times with the same "id". `
                );
            }

            logger.warn(
                `**WARNING** Sandbox has non-committed files. ` +
                    `We are going to commit ` +
                    `those files to ensure that the sandbox is in a clean ` +
                    `state before refactor. Before pushing the changes, ` +
                    `please make sure that the changes do not contain any ` +
                    `sensitive information.`
            );

            await gitAddAll({
                location: sandboxDirectoryPath,
            });

            await gitCommit({
                location: sandboxDirectoryPath,
                message:
                    `chore: cleanup before refactor - committing` +
                    ` modified changes that are not part of ` +
                    ` the refactor`,
            });
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
        });

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

                await runPackageManagerScript({
                    packageManager,
                    script,
                    location: sandboxDirectoryPath,
                });
            }, Promise.resolve());
        }

        const result = {
            startCommit: refactorStartCommit,
            originalBranch: branch,
            defaultBranch: ensureTruthy(defaultBranch),
            sandboxDirectoryPath,
        };

        return result;
    },
});

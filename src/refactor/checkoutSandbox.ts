import { readFile } from 'fs/promises';
import hash from 'object-hash';
import { join } from 'path';
import { z } from 'zod';

import { findRepositoryRoot } from '../file-system/findRepositoryRoot';
import { gitAddAll } from '../git/gitAddAll';
import { gitClone } from '../git/gitClone';
import { gitCommit } from '../git/gitCommit';
import { gitCurrentBranch } from '../git/gitCurrentBranch';
import { gitDefaultBranch } from '../git/gitDefaultBranch';
import { gitResetHard } from '../git/gitResetHard';
import { gitRevParse } from '../git/gitRevParse';
import { gitStatus } from '../git/gitStatus';
import { determinePackageManager } from '../package-manager/determinePackageManager';
import { installDependencies } from '../package-manager/installDependencies';
import { runPackageManagerScript } from '../package-manager/runPackageManagerScript';
import { makePipelineFunction } from '../pipeline/makePipelineFunction';
import { createSandbox, sandboxLocation } from '../sandbox/createSandbox';
import { ensureTruthy } from '../utils/isTruthy';
import { makeDependencies } from './dependencies';
import { refactorConfigSchema } from './types';

export const checkoutSandboxInputSchema = refactorConfigSchema
    .pick({
        name: true,
        repository: true,
        ref: true,
        bootstrapScripts: true,
        allowDirtyWorkingTree: true,
    })
    .transform(async (input) => {
        if (!input.repository && !input.ref) {
            const root = await findRepositoryRoot();
            const status = await gitStatus({
                location: root,
            });
            const allFiles = Object.values(status).flat();

            if (allFiles.length > 0) {
                const contents = new Map(
                    await Promise.all(
                        allFiles.map((file) =>
                            readFile(join(root, file), 'utf-8')
                                .then((data) => [file, data] as const)
                                .catch((err: unknown) => {
                                    if (
                                        err &&
                                        typeof err === 'object' &&
                                        'code' in err &&
                                        err.code === 'ENOENT'
                                    ) {
                                        return [file, ''] as const;
                                    }
                                    throw err;
                                })
                        )
                    )
                );

                const changedFilesHash = hash(contents);

                return {
                    ...input,
                    changedFilesHash,
                };
            }
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

export const checkoutSandbox = makePipelineFunction({
    name: 'checkout-sandbox',
    transform: async (config, _persistence, getDeps = makeDependencies) => {
        const { logger, findRepositoryRoot } = getDeps();

        const root = await findRepositoryRoot();

        const { sandboxId, sandboxDirectoryPath } = sandboxLocation({
            tag: config.name,
            /**
             * @todo don't forget to change this before committing
             */
            sandboxId: 'unr87ijk',
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
                throw new Error(
                    `Sandbox has non-committed files, please set ` +
                        `allowDirtyWorkingTree to ignore this and continue. ` +
                        `Running with dirty working tree will lead to non ` +
                        `deterministic results even when refactor is run ` +
                        `multiple times with the same "id". `
                );
            }

            logger.warn(
                `Sandbox has non-committed files. We are going to commit ` +
                    `those files to ensure that the sandbox is in a clean ` +
                    `state before refactor.`
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

        return {
            startCommit: refactorStartCommit,
            originalBranch: branch,
            defaultBranch: ensureTruthy(defaultBranch),
            sandboxDirectoryPath,
        };
    },
    inputSchema: checkoutSandboxInputSchema,
    resultSchema: checkoutSandboxResultSchema,
});

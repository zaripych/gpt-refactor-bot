import { join } from 'path';

import { AbortError } from '../errors/abortError';
import { findRepositoryRoot } from '../file-system/findRepositoryRoot';
import { gitCheckoutNewBranch } from '../git/gitCheckoutNewBranch';
import { gitFetch } from '../git/gitFetch';
import { gitForceCreateBranch } from '../git/gitForceCreateBranch';
import { gitRevParse } from '../git/gitRevParse';
import { logger } from '../logger/logger';
import { pipeline } from '../pipeline/pipeline';
import { randomText } from '../utils/randomText';
import { checkoutSandbox } from './checkoutSandbox';
import { enrichObjective } from './enrichObjective';
import { refactorGoal } from './refactorGoal';
import { type RefactorConfig, refactorConfigSchema } from './types';

const createPipe = (opts?: { saveResult?: boolean }) => {
    const pipe = pipeline(refactorConfigSchema, opts)
        .append(checkoutSandbox)
        .append(enrichObjective)
        .combineLast((input, result) => ({
            ...input,
            ...result,
            objective: result.enrichedObjective,
        }))
        .append(refactorGoal);

    return pipe;
};

async function loadRefactorState(opts: {
    config: RefactorConfig;
    cache?: boolean;
}) {
    const pipe = createPipe({
        saveResult: opts.cache ?? true,
    });

    const root = await findRepositoryRoot();

    if (opts.config.id) {
        const location = join(
            root,
            `.refactor-bot/refactors/${opts.config.name}/state/`,
            opts.config.id
        );

        return {
            pipe,
            location,
            id: opts.config.id,
        };
    } else {
        const id = randomText(8);

        return {
            pipe,
            location: join(
                root,
                `.refactor-bot/refactors/${opts.config.name}/state/`,
                id
            ),
            id,
        };
    }
}

export async function refactor(opts: {
    config: RefactorConfig;
    cache?: boolean;
}) {
    const { pipe, location, id } = await loadRefactorState(opts);

    logger.info(
        `Starting refactor with id "${id}", process id: "${process.pid}"`
    );

    const persistence = {
        location,
    };

    try {
        process.on('SIGINT', () => {
            pipe.abort();
        });

        const result = await pipe.transform(
            {
                ...opts.config,
                id,
            },
            persistence
        );

        const lastCommit = await gitRevParse({
            location: result.sandboxDirectoryPath,
            ref: 'HEAD',
        });

        if (
            lastCommit !== result.startCommit &&
            Object.keys(result.accepted).length > 0
        ) {
            const successBranch = `refactor-bot/${opts.config.name}-${result.id}`;

            await gitCheckoutNewBranch({
                location: result.sandboxDirectoryPath,
                branchName: successBranch,
            });

            if (!result.repository) {
                const localRoot = await findRepositoryRoot();

                await gitFetch({
                    location: localRoot,
                    from: result.sandboxDirectoryPath,
                    refs: [successBranch],
                });

                await gitForceCreateBranch({
                    location: localRoot,
                    branchName: successBranch,
                    ref: 'FETCH_HEAD',
                });
            }

            await pipe.clean(persistence);

            return {
                ...result,
                successBranch,
            };
        }

        await pipe.clean(persistence);

        return {
            ...result,
            successBranch: undefined,
        };
    } catch (err) {
        if (!(err instanceof AbortError)) {
            await pipe.clean(persistence);
        }
        throw err;
    }
}

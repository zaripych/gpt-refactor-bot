import { join } from 'path';

import { flush } from '../logger/logger';
import { pipeline } from '../pipeline/pipeline';
import { randomText } from '../utils/randomText';
import { checkoutSandbox } from './checkoutSandbox';
import { makeDependencies } from './dependencies';
import { enrichObjective } from './enrichObjective';
import { refactorGoal } from './refactorGoal';
import { type RefactorConfig, refactorConfigSchema } from './types';

const createPipe = () => {
    const pipe = pipeline(refactorConfigSchema)
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

async function loadRefactorState(
    opts: {
        id?: string;
        config: RefactorConfig;
    },
    getDeps = makeDependencies
) {
    const { findRepositoryRoot } = getDeps();

    const pipe = createPipe();

    const root = await findRepositoryRoot();

    if (opts.id) {
        const location = join(
            root,
            `.refactor-bot/refactors/${opts.config.name}/state/`,
            opts.id
        );

        return {
            pipe,
            location,
            id: opts.id,
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

export async function refactor(
    opts: {
        id?: string;
        config: RefactorConfig;
    },
    getDeps = makeDependencies
) {
    const { logger } = getDeps();

    const { pipe, location, id } = await loadRefactorState(opts, getDeps);

    logger.debug(
        `Starting refactor with id "${id}", process id: "${process.pid}"`
    );

    const persistence = {
        location,
    };
    try {
        process.on('SIGINT', () => {
            pipe.abort();
        });
        process.on('uncaughtException', (error) => {
            logger.error('Uncaught exception', error);
        });
        process.on('unhandledRejection', (error) => {
            logger.error('Unhandled rejection', error);
        });
        await pipe.transform(opts.config, persistence);
    } catch (exc) {
        logger.error(exc);
    } finally {
        await pipe.clean(persistence);
        await flush();
    }
}

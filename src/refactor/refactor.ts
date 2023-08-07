import { join } from 'path';

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

    logger.debug(`Starting refactor with id "${id}"`);

    const persistence = {
        location,
    };
    try {
        process.on('SIGINT', () => {
            pipe.abort();
        });
        await pipe.transform(opts.config, persistence);
    } finally {
        await pipe.clean(persistence);
    }
}

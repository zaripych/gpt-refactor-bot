import fg from 'fast-glob';
import { basename, dirname, join } from 'path';

import { hasOneElement } from '../utils/hasOne';
import { randomText } from '../utils/randomText';
import {
    checkoutSandbox,
    checkoutSandboxResultSchema,
} from './checkoutSandbox';
import { makeDependencies } from './dependencies';
import {
    enrichObjective,
    enrichObjectiveResultSchema,
} from './enrichObjective';
import { pipeline } from './pipeline';
import { type RefactorConfig, refactorConfigSchema } from './types';

const createPipe = (getDeps = makeDependencies) => {
    const pipe = pipeline<RefactorConfig>()
        .append({
            name: 'checkout-sandbox',
            transform: (config) => checkoutSandbox(config, getDeps),
            resultSchema: checkoutSandboxResultSchema,
        })
        .append({
            name: 'enrich-objective',
            transform: (config) => enrichObjective(config, getDeps),
            resultSchema: enrichObjectiveResultSchema,
        });

    return pipe;
};

async function loadRefactorState(
    opts: {
        id?: string;
        config?: RefactorConfig;
    },
    getDeps = makeDependencies
) {
    const { findRepositoryRoot } = getDeps();

    const pipe = createPipe(getDeps);

    const root = await findRepositoryRoot();

    if (opts.id) {
        const init = await fg(`.refactor-bot/refactors/*/state/${opts.id}/*`, {
            cwd: root,
        });

        if (!hasOneElement(init)) {
            throw new Error(
                `Cannot find files to load state from for id "${opts.id}"`
            );
        }

        const name = basename(dirname(dirname(dirname(init[0]))));

        const location = join(root, `.refactor-bot/refactors/${name}/state/`);

        const { initialInput } = await pipe.load({
            id: opts.id,
            location,
            initialInputSchema: refactorConfigSchema,
        });

        return {
            config: initialInput,
            pipe,
            location,
        };
    } else {
        if (!opts.config) {
            throw new Error(
                `No id of previous refactor run nor config has been provided, please provide either id or config`
            );
        }

        return {
            config: opts.config,
            pipe,
            location: join(
                root,
                `.refactor-bot/refactors/${opts.config.name}/state/`
            ),
        };
    }
}

export async function refactor(
    opts: {
        id?: string;
        config?: RefactorConfig;
    },
    getDeps = makeDependencies
) {
    const { logger } = getDeps();

    const id = opts.id ?? randomText(8);

    logger.debug(`Starting refactor with id "${id}"`);

    const { pipe, config, location } = await loadRefactorState(opts, getDeps);

    await pipe.transform(config, {
        id,
        location,
    });
}

import { join } from 'path';

import { findRepositoryRoot } from '../file-system/findRepositoryRoot';
import { gitCheckoutNewBranch } from '../git/gitCheckoutNewBranch';
import { gitFetch } from '../git/gitFetch';
import { gitForceCreateBranch } from '../git/gitForceCreateBranch';
import { gitRevParse } from '../git/gitRevParse';
import { logger } from '../logger/logger';
import { abortPipeline } from '../pipeline/abort';
import { cleanCache } from '../pipeline/cache';
import { logExecutionLog } from '../pipeline/log';
import { startPipeline } from '../pipeline/startPipeline';
import { randomText } from '../utils/randomText';
import { checkoutSandbox } from './checkoutSandbox';
import { enrichObjective } from './enrichObjective';
import { refactorGoal } from './refactorGoal';
import { retrieveParameters } from './retrieveParameters';
import { type RefactorConfig } from './types';

const createPipeline = (opts: {
    //
    location: string;
    saveResult: boolean;
}) => {
    const state = startPipeline({
        location: opts.location,
        saveInput: true,
        saveResult: opts.saveResult,
    });

    return {
        start: async (input: RefactorConfig) => {
            try {
                const checkoutResult = await checkoutSandbox(input, state);

                const retrieveParametersResult = await retrieveParameters(
                    {
                        ...input,
                        ...checkoutResult,
                    },
                    state
                );

                const enrichObjectiveResult = await enrichObjective(
                    {
                        ...input,
                        ...checkoutResult,
                        ...retrieveParametersResult,
                    },
                    state
                );

                const refactorResult = await refactorGoal(
                    {
                        ...input,
                        ...checkoutResult,
                        ...retrieveParametersResult,
                        ...enrichObjectiveResult,
                        objective: enrichObjectiveResult.enrichedObjective,
                    },
                    state
                );

                await cleanCache(state);

                return {
                    ...input,
                    ...checkoutResult,
                    ...retrieveParametersResult,
                    ...enrichObjectiveResult,
                    ...refactorResult,
                };
            } finally {
                logExecutionLog(state);
            }
        },
        abort: () => {
            abortPipeline(state);
        },
    };
};

async function loadRefactorState(opts: {
    config: RefactorConfig;
    saveToCache?: boolean;
}) {
    const root = await findRepositoryRoot();

    const id = opts.config.id ?? randomText(8);

    const location = join(
        root,
        `.refactor-bot/refactors/${opts.config.name}/state/`,
        id
    );

    return {
        ...createPipeline({
            location,
            saveResult: opts.saveToCache ?? true,
        }),
        location,
        id: opts.config.id,
    };
}

export async function refactor(opts: {
    config: RefactorConfig;
    saveToCache?: boolean;
}) {
    const { start, abort, id } = await loadRefactorState(opts);

    logger.info(
        `Starting refactor with id "${id}", process id: "${process.pid}"`
    );

    process.on('SIGINT', () => {
        abort();
    });

    const result = await start({
        ...opts.config,
        id,
    });

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

        return {
            ...result,
            successBranch,
        };
    }

    return {
        ...result,
        successBranch: undefined,
    };
}

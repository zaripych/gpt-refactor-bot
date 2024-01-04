import { join } from 'path';

import { createCachedPipeline } from '../cache/state';
import { findRepositoryRoot } from '../file-system/findRepositoryRoot';
import { gitCheckoutNewBranch } from '../git/gitCheckoutNewBranch';
import { gitFetch } from '../git/gitFetch';
import { gitForceCreateBranch } from '../git/gitForceCreateBranch';
import { gitRevParse } from '../git/gitRevParse';
import { logger } from '../logger/logger';
import { randomText } from '../utils/randomText';
import { checkoutSandbox } from './checkoutSandbox';
import { enrichObjective } from './enrichObjective';
import { refactorGoal } from './refactorGoal';
import { resultsCollector } from './resultsCollector';
import { retrieveParameters } from './retrieveParameters';
import { type RefactorConfig } from './types';

const createPipeline = (opts: {
    location: string;
    saveToCache: boolean;
    enableCacheFor?: string[];
}) =>
    createCachedPipeline({
        location: opts.location,
        enableCacheFor: opts.enableCacheFor,
        saveToCache: opts.saveToCache,
        pipeline: async (input: RefactorConfig) => {
            const checkoutResult = await checkoutSandbox(input);

            const retrieveParametersResult = await retrieveParameters({
                ...input,
                ...checkoutResult,
            });

            const enrichObjectiveResult = await enrichObjective({
                ...input,
                ...checkoutResult,
                ...retrieveParametersResult,
            });

            const refactorResult = await refactorGoal({
                ...input,
                ...checkoutResult,
                ...retrieveParametersResult,
                ...enrichObjectiveResult,
                objective: enrichObjectiveResult.enrichedObjective,
            });

            return {
                ...input,
                ...checkoutResult,
                ...retrieveParametersResult,
                ...enrichObjectiveResult,
                ...refactorResult,
            };
        },
    });

async function loadRefactorState(opts: {
    config: RefactorConfig;
    saveToCache?: boolean;
    enableCacheFor?: string[];
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
            saveToCache: opts.saveToCache ?? true,
            enableCacheFor: opts.enableCacheFor,
        }),
        location,
        id: opts.config.id,
    };
}

export async function refactor(opts: {
    config: RefactorConfig;
    saveToCache?: boolean;
    enableCacheFor?: string[];
}) {
    if (
        opts.enableCacheFor &&
        opts.enableCacheFor.filter(Boolean).length === 0
    ) {
        throw new Error('enableCacheFor cannot be empty');
    }
    const { execute, abort, id } = await loadRefactorState(opts);

    logger.info(
        `Starting refactor with id "${id}", process id: "${process.pid}"`
    );

    process.on('SIGINT', () => {
        abort();
    });

    const { teardown, finalizeResults } = resultsCollector();

    let error: Error | undefined = undefined;
    try {
        await execute({
            ...opts.config,
            id,
        });
    } catch (exc) {
        if (!(exc instanceof Error)) {
            throw exc;
        }
        error = exc;
    } finally {
        teardown();
    }

    const result = finalizeResults(error);

    const lastCommit = await gitRevParse({
        location: result.sandboxDirectoryPath,
        ref: 'HEAD',
    });

    if (
        lastCommit !== result.startCommit &&
        Object.keys(result.accepted).length > 0
    ) {
        const successBranch = `refactor-bot/${opts.config.name}-${id}`;

        await gitCheckoutNewBranch({
            location: result.sandboxDirectoryPath,
            branchName: successBranch,
        });

        if (!opts.config.repository) {
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

            return {
                ...result,
                successBranch,
            };
        }
    }

    return {
        ...result,
        successBranch: undefined,
    };
}

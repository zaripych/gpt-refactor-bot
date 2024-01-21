import { writeFile } from 'fs/promises';
import { dump } from 'js-yaml';
import { join } from 'path';

import { createCachedPipeline } from '../cache/state';
import { findRepositoryRoot } from '../file-system/findRepositoryRoot';
import { gitCheckoutNewBranch } from '../git/gitCheckoutNewBranch';
import { gitFetch } from '../git/gitFetch';
import { gitForceCreateBranch } from '../git/gitForceCreateBranch';
import { gitRevParse } from '../git/gitRevParse';
import { logger } from '../logger/logger';
import { format } from '../text/format';
import { line } from '../text/line';
import { randomText } from '../utils/randomText';
import { checkoutSandbox } from './checkoutSandbox';
import { enrichObjective } from './enrichObjective';
import { refactorGoal } from './refactorGoal';
import {
    collectedRefactorResultSchema,
    resultsCollector,
} from './resultsCollector';
import { retrieveParameters } from './retrieveParameters';
import { type RefactorConfig } from './types';

export async function refactor(opts: {
    config: RefactorConfig;
    saveToCache?: boolean;
    enableCacheFor?: string[];
    disableCacheFor?: string[];
}) {
    if (
        opts.enableCacheFor &&
        opts.enableCacheFor.filter(Boolean).length === 0
    ) {
        throw new Error('enableCacheFor cannot be empty');
    }

    const root = process.env['CACHE_ROOT'] ?? (await findRepositoryRoot());

    const id = opts.config.id ?? randomText(8);

    const location = join(
        root,
        `.refactor-bot/refactors/${opts.config.name}/state/`,
        id
    );

    const { execute, abort } = createCachedPipeline({
        location,
        enableCacheFor: opts.enableCacheFor,
        saveToCache: opts.saveToCache ?? true,
        disableCacheFor: opts.disableCacheFor,
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

    logger.info(
        format(
            line`
                Starting refactor with id "%id%", process id: "%processId%",
                refactoring can be interrupted at any time with SIGINT and
                restarted later, when id is passed to the cli:
                \`npx refactor-bot refactor --id %id%\`.
            `,
            {
                id,
                processId: String(process.pid),
            }
        )
    );
    if (!process.env['LOG_LEVEL']) {
        logger.info(line`
            Note that refactoring might take a while and by default there is not
            much output. If you want to see more output, you can set the log
            level to "debug" by setting the environment variable "LOG_LEVEL" to
            "debug".
        `);
    }

    let numberOfInterrupts = 0;
    process.on('SIGINT', () => {
        logger.info('Received SIGINT ... aborting');

        abort();

        numberOfInterrupts += 1;

        if (numberOfInterrupts > 5) {
            console.log('Forcefully exiting');
            process.exit(1);
        }
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

    const result = finalizeResults(opts.config, error);

    await writeFile(
        join(location, 'result.yaml'),
        dump(collectedRefactorResultSchema.parse(result)),
        'utf-8'
    );

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

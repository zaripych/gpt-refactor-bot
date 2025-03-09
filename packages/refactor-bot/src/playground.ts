import { ignoreElements, tap } from 'rxjs';

import { bootstrap } from './bootstrap';
import { runEpic } from './event-bus';
import { logger } from './logger/logger';
import { prepareMinimalDeps } from './refactor/dependencies/prepareMinimalDeps';

/**
 * @note this is a playground file, it is not used in production, I basically
 * run this file in watch mode to see if the changes I make to the codebase
 * are working as expected - because sometimes you just don't want to commit to
 * maintaining tests (especially if they require a lot of "test-cases" and
 * setup "data" to go along with them - this is especially true for functions
 * that work with codebase)
 *
 * @note want to test something? try it yourself:
 * pnpm tsx --watch ./src/playground.ts
 */

runEpic((stream) =>
    stream.pipe(
        tap((event) => {
            logger.trace(event);
        }),
        ignoreElements()
    )
);

logger.info(
    await bootstrap(async () => {
        const { functionsRepository } = await prepareMinimalDeps({
            sandboxDirectoryPath: '.',
        });
        return await functionsRepository().executeFunction({
            name: 'moduleImports',
            arguments: {
                module: 'fs/promises',
                // initialFilePath:
                //     'packages/refactor-bot/src/refactor/planTasks.ts',
            },
        });
    })
);

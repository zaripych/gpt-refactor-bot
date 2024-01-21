import { join } from 'path';
import { ignoreElements, tap } from 'rxjs';

import { bootstrap } from './bootstrap';
import { evaluateFileChanges } from './evaluate/evaluateFileChanges';
import { runEpic } from './event-bus';
import { gitShowFileCommitSummary } from './git/gitShowFileCommitSummary';
import { logger } from './logger/logger';

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

const location =
    '/var/folders/kk/cj4kd1wx1rg16xq_jhdw75kc0000gn/T/.refactor-bot/sandboxes/test-likely-failure-oTH22sfc';

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
        return await evaluateFileChanges(
            {
                sandboxDirectoryPath: location,
                requirements: [
                    'Replace all usages of `readFile` from `fs/promises` module with `readFileSync` from `fs` module in packages/refactor-bot/src/cache/dependencies.ts`.',
                ],
                ...(await gitShowFileCommitSummary({
                    location,
                    filePath: 'packages/refactor-bot/src/cache/dependencies.ts',
                    ref: '28d5f0d1f7985bd16e4d3cc4f26ffd53c1a6f94b',
                })),
            },
            {
                location: join(
                    '.refactor-bot/playground-cache',
                    'evaluateFileChanges'
                ),
            }
        );
    })
);

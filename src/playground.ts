import { gitFilesDiff } from './git/gitFilesDiff';
import { gitShowFile } from './git/gitShowFile';
import { logger } from './logger/logger';
import { changeInfo } from './ts-morph/quick-info/changeInfo';

/**
 * @note this is a playground file, it is not used in production, I basically
 * run this file in watch mode to see if the changes I make to the codebase
 * are working as expected as I don't have a good way to test with "ts-morph"
 * in dependencies
 *
 * @note want to test something? try it yourself:
 * pnpm tsx --watch ./src/playground.ts
 *
 * @note try Quokka VSCode extension for a better playground experience
 */

const location =
    '/private/var/folders/kk/cj4kd1wx1rg16xq_jhdw75kc0000gn/T/.refactor-bot/sandboxes/replace-read-file-sync-unr87ijk';

const filePath = 'src/pipeline/dependencies.ts';

const fileDiff = await gitFilesDiff({
    location,
    filePaths: [filePath],
    ref: 'HEAD~1',
});

logger.info(
    await changeInfo({
        location,
        filePath,
        oldFileContents: await gitShowFile({
            location,
            filePath,
            ref: 'HEAD~1',
        }),
        newFileContents: await gitShowFile({
            location,
            filePath,
            ref: 'HEAD',
        }),
        fileDiff,
    })
);

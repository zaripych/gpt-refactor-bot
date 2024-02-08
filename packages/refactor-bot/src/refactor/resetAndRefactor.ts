import { z } from 'zod';

import { ConfigurationError } from '../errors/configurationError';
import { gitResetHard } from '../git/gitResetHard';
import { gitRevParse } from '../git/gitRevParse';
import { gitStatus } from '../git/gitStatus';
import { logger } from '../logger/logger';
import { line } from '../text/line';
import { planAndRefactor } from './planAndRefactor';
import { resetToLastAcceptedCommit } from './resetToLastAcceptedCommit';
import {
    checkDependenciesSchema,
    formatDependenciesSchema,
    functionsRepositorySchema,
    llmDependenciesSchema,
} from './types';

export const prepareDepsAndStartRefactorSchema = z.object({
    objective: z.string(),
    requirements: z.array(z.string()).nonempty(),
    sandboxDirectoryPath: z.string(),
    startCommit: z.string(),
    filesToEdit: z.array(z.string()),

    llmDependencies: llmDependenciesSchema,
    functionsRepository: functionsRepositorySchema,
    checkDependencies: checkDependenciesSchema,
    formatDependencies: formatDependenciesSchema,
});

export const resetAndRefactor = async (
    inputRaw: z.input<typeof prepareDepsAndStartRefactorSchema>
) => {
    const input = await prepareDepsAndStartRefactorSchema.parseAsync(inputRaw);

    const { sandboxDirectoryPath } = input;

    const currentCommit = await gitRevParse({
        location: sandboxDirectoryPath,
        ref: 'HEAD',
    });

    const status = await gitStatus({
        location: sandboxDirectoryPath,
    });

    if (
        currentCommit !== input.startCommit ||
        Object.values(status).length > 0
    ) {
        /**
         * @note we get here when the refactor is run again after a failure
         * or when the user made changes to the sandbox directory
         */
        logger.info('Resetting to start commit', input.startCommit);
        await gitResetHard({
            location: sandboxDirectoryPath,
            ref: input.startCommit,
        });
    }

    const checkResult = await input.checkDependencies().check();

    if (checkResult.issues.length > 0) {
        logger.warn(
            'Following scripts are used for checks',
            input.checkDependencies().scripts
        );
        logger.warn('Found following issues', checkResult.issues);
        throw new ConfigurationError(line`
            Initial checks have failed - at the moment, the refactor command
            is designed to be run on the codebase that passes all checks.
            Please fix the issues or checkout the repository at a green
            state and try again. Ensure that the refactor bot is configured
            correctly and executing correct commands to make the checks.
            Checks can be disabled and adjusted in the goal.md file. Use the
            above log entries to understand which checks have failed.
        `);
    }

    const result = await planAndRefactor(input);

    await resetToLastAcceptedCommit({
        location: input.sandboxDirectoryPath,
        result,
    });

    return result;
};

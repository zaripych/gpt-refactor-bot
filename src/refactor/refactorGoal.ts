import { z } from 'zod';

import { ConfigurationError } from '../errors/configurationError';
import { gitResetHard } from '../git/gitResetHard';
import { gitRevParse } from '../git/gitRevParse';
import { gitStatus } from '../git/gitStatus';
import { logger } from '../logger/logger';
import { determinePackageManager } from '../package-manager/determinePackageManager';
import { makePipelineFunction } from '../pipeline/makePipelineFunction';
import { line } from '../text/line';
import { check, checkScriptsFromConfig } from './check';
import { discoverCheckDependencies } from './discoverDependencies';
import {
    planAndRefactor,
    planAndRefactorResultSchema,
} from './refactorObjective';
import { refactorConfigSchema } from './types';

export const refactorGoalInputSchema = refactorConfigSchema
    .augment({
        objective: z.string(),
        sandboxDirectoryPath: z.string(),
        startCommit: z.string(),
    })
    .transform(async (input) => {
        const checks = await discoverCheckDependencies({
            location: input.sandboxDirectoryPath,
        });
        if (!checks.tsc) {
            throw new ConfigurationError(
                `Cannot find TypeScript dependencies in the repository, ` +
                    ` The refactor bot only supports TypeScript at the moment`
            );
        }
        const scripts = checkScriptsFromConfig(input, checks);
        return {
            ...input,
            scripts,
        };
    });

export const refactorGoal = makePipelineFunction({
    name: 'goal',
    inputSchema: refactorGoalInputSchema,
    resultSchema: planAndRefactorResultSchema,
    transform: async (input, persistence) => {
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

        const checkResult = await check({
            packageManager: await determinePackageManager({
                directory: input.sandboxDirectoryPath,
            }),
            location: input.sandboxDirectoryPath,
            scripts: input.scripts,
            startCommit: input.startCommit,
        });
        if (checkResult.issues.length > 0) {
            logger.info('Following scripts are used for checks', input.scripts);
            logger.info('Found following issues', checkResult.issues);
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

        const planAndRefactorWithPersistence =
            planAndRefactor.withPersistence();

        try {
            return await planAndRefactorWithPersistence.transform(
                input,
                persistence
            );
        } finally {
            if (persistence) {
                await planAndRefactorWithPersistence.clean(persistence);
            }
        }
    },
});

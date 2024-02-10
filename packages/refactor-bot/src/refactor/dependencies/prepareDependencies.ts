import type { z } from 'zod';

import { prepareFunctionsRepository } from '../../functions/prepareFunctionsRepository';
import { functions } from '../../functions/registry';
import { prepareLlmDependencies } from '../../llm/llmDependencies';
import { prepareCodeCheckingDeps } from '../code-checking/prepareCodeCheckingDeps';
import { prepareCodeFormattingDeps } from '../code-formatting/prepareCodeFormattingDeps';
import type { refactorConfigSchema } from '../types';

export async function prepareRefactorDeps(
    config: z.output<typeof refactorConfigSchema> & {
        sandboxDirectoryPath: string;
        startCommit: string;
    }
) {
    const { sandboxDirectoryPath } = config;

    const llmDependencies = await prepareLlmDependencies({
        model: config.model,
        budgetCents: config.budgetCents,
        modelByStepCode: config.modelByStepCode,
        useMoreExpensiveModelsOnRetry: config.useMoreExpensiveModelsOnRetry,
    });

    const checkDependencies = await prepareCodeCheckingDeps({
        location: sandboxDirectoryPath,
        startCommit: config.startCommit,
        eslint: config.eslint,
        jest: config.jest,
        tsc: config.tsc,
    });

    const formatDependencies = await prepareCodeFormattingDeps({
        location: sandboxDirectoryPath,
        scripts: checkDependencies.scripts,
    });

    const functionsRepository = await prepareFunctionsRepository({
        functions: functions.filter((fn) =>
            config.allowedFunctions.includes(fn.name)
        ),
        config: {
            repositoryRoot: config.sandboxDirectoryPath,
            allowedFunctions: config.allowedFunctions,
            ignore: config.ignore,
            ignoreFiles: config.ignoreFiles,
            scope: config.scope,
            tsConfigJsonFileName: config.tsConfigJsonFileName,
        },
    });

    return {
        llmDependencies: () => llmDependencies,
        checkDependencies: () => checkDependencies,
        formatDependencies: () => formatDependencies,
        functionsRepository: () => functionsRepository,
    };
}

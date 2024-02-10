import { z } from 'zod';

import { prepareFunctionsRepository } from '../../functions/prepareFunctionsRepository';
import { functions } from '../../functions/registry';
import { prepareLlmDependencies } from '../../llm/llmDependencies';
import { prepareCodeCheckingDeps } from '../code-checking/prepareCodeCheckingDeps';
import { prepareCodeFormattingDeps } from '../code-formatting/prepareCodeFormattingDeps';
import { refactorConfigSchema } from '../types';

export async function prepareMinimalDeps(minimalConfig: {
    sandboxDirectoryPath: string;
    startCommit?: string;
    allowedFunctions?: string[];
}) {
    const { sandboxDirectoryPath, ...config } = refactorConfigSchema
        .omit({
            name: true,
            objective: true,
        })
        .augment({
            sandboxDirectoryPath: z.string().nonempty(),
        })
        .parse(minimalConfig);

    const startCommit = minimalConfig.startCommit ?? 'HEAD';

    const llmDependencies = await prepareLlmDependencies({
        model: config.model,
        budgetCents: config.budgetCents,
        modelByStepCode: config.modelByStepCode,
        useMoreExpensiveModelsOnRetry: config.useMoreExpensiveModelsOnRetry,
    });

    const checkDependencies = await prepareCodeCheckingDeps({
        location: sandboxDirectoryPath,
        startCommit,
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
            repositoryRoot: sandboxDirectoryPath,
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

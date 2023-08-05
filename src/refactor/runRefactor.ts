import fg from 'fast-glob';
import { basename, dirname } from 'path';
import prompts from 'prompts';

import { findRepositoryRoot } from '../file-system/findRepositoryRoot';
import { hasOneElement } from '../utils/hasOne';
import { loadRefactorConfigs } from './loadRefactors';
import { refactor } from './refactor';
import type { RefactorConfig } from './types';

async function promptForConfig(refactors: RefactorConfig[]) {
    const answers = (await prompts({
        name: 'config',
        message: 'Select the refactor to run',
        type: 'select',
        choices: refactors.map((config) => ({
            title: config.name,
            value: config,
        })),
    })) as {
        config?: RefactorConfig;
    };

    if (!answers.config) {
        process.exit(0);
    }

    return {
        config: answers.config,
    };
}

async function determineConfig(opts: {
    id?: string;
    name?: string;
    configs: RefactorConfig[];
}) {
    if (opts.name) {
        const config = opts.configs.find((config) => config.name === opts.name);

        if (!config) {
            throw new Error(`Cannot find config with name ${opts.name}`);
        }

        return {
            config,
        };
    }

    if (opts.id) {
        const repoRoot = await findRepositoryRoot();

        const init = await fg(
            `.refactor-bot/refactors/*/state/${opts.id}/*/*`,
            {
                cwd: repoRoot,
            }
        );

        if (!hasOneElement(init)) {
            throw new Error(
                `Cannot find files to load state from for id "${opts.id}"`
            );
        }

        const name = basename(dirname(dirname(dirname(dirname(init[0])))));

        const config = opts.configs.find((config) => config.name === name);
        if (!config) {
            throw new Error(
                `No refactor config has been found, please provide id for an existing refactor`
            );
        }

        return {
            config,
        };
    }

    return await promptForConfig(opts.configs);
}

export async function runRefactor(opts: {
    id?: string;
    name?: string;
    //
}) {
    const configs = await loadRefactorConfigs();

    const { config } = await determineConfig({
        ...opts,
        configs,
    });

    await refactor({
        ...opts,
        config,
    });
}

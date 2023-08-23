import fg from 'fast-glob';
import { mkdir, writeFile } from 'fs/promises';
import { basename, dirname } from 'path';
import prompts from 'prompts';
import { z } from 'zod';

import { findRepositoryRoot } from '../file-system/findRepositoryRoot';
import { goToEndOfFile } from '../prompt/editor';
import { hasOneElement } from '../utils/hasOne';
import { loadRefactorConfigs } from './loadRefactors';
import { refactor } from './refactor';
import type { RefactorConfig } from './types';

const validateUsingSchema =
    <T extends z.ZodType>(schema: T) =>
    (value: z.infer<T>) => {
        const result = schema.safeParse(value);
        if (result.success) {
            return true;
        } else {
            return result.error.issues[0]?.message || result.error.message;
        }
    };

async function promptForConfig(refactors: RefactorConfig[]) {
    const answers = (await prompts({
        name: 'config',
        message: 'Select the refactor to run',
        type: 'select',
        choices: [
            ...refactors.map((config) => ({
                title: config.name,
                value: config,
            })),
            {
                title: 'New refactor...',
                value: 'new',
            },
        ],
    })) as {
        config?: RefactorConfig | 'new';
    };

    if (answers.config === 'new') {
        const answers = (await prompts({
            name: 'name',
            message: 'Enter a short name for the refactor',
            type: 'text',
            validate: validateUsingSchema(
                z.string().regex(/^[a-zA-Z0-9-]+$/, {
                    message:
                        'Must be a valid directory name matching /^[a-zA-Z0-9-]+$/',
                })
            ),
        })) as {
            name: string;
        };

        if (!answers.name) {
            process.exit(0);
        }

        await mkdir(`.refactor-bot/refactors/${answers.name}`, {
            recursive: true,
        });

        const goalMdFilePath = `.refactor-bot/refactors/${answers.name}/goal.md`;

        await writeFile(
            goalMdFilePath,
            `
\`\`\`yaml
# For information about possible options have a look at the code:
# https://github.com/zaripych/refactor-bot/blob/9b928d601a7586cd1adf20dbeb406625a0d7663f/src/refactor/types.ts#L11
budgetCents: 100
model: gpt-4
\`\`\`

> Please describe the refactoring in here, save the file and restart the command to continue...
`,
            'utf-8'
        );

        if (!(await goToEndOfFile(goalMdFilePath))) {
            console.log(
                `Please describe the refactoring in "${goalMdFilePath}", save the file and restart the command to continue...`
            );
        }

        process.exit(0);
    }

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

        const init = await fg(`.refactor-bot/refactors/*/state/${opts.id}/*`, {
            cwd: repoRoot,
        });

        if (!hasOneElement(init)) {
            throw new Error(
                `Cannot find files to load state from for id "${opts.id}"`
            );
        }

        const name = basename(dirname(dirname(dirname(init[0]))));

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

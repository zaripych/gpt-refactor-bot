import { formatWithOptions } from 'node:util';

import type { CommandModule } from 'yargs';

import { type Models, modelsSchema } from '../chat-gpt/api';
import { functions } from '../functions/registry';

export const promptCommand: CommandModule<
    Record<never, never>,
    {
        model?: Models;
        watch: boolean;
    }
> = {
    command: 'prompt',
    describe: 'Sends a prompt to the ChatGPT API to generate a response',
    builder: (yargs) =>
        yargs
            .option('model', {
                choices: modelsSchema.options,
            })
            .option('watch', {
                type: 'boolean',
                describe:
                    'Watch for changes in the .md file and automatically send requests to the API',
                default: false,
            })
            .option('functions', {
                type: 'string',
                array: true,
                describe:
                    'Names of functions to allow in the prompt. If not specified, all functions are allowed.',
                default: functions.map((f) => f.name),
            }),
    handler: async (opts) => {
        try {
            const { run } = await import('./run');
            await run(opts);
        } catch (err) {
            console.error(
                formatWithOptions(
                    { depth: Number.MAX_SAFE_INTEGER, colors: true },
                    err
                )
            );
            if (
                typeof process.exitCode !== 'number' ||
                process.exitCode === 0
            ) {
                process.exitCode = 1;
            }
        }
    },
};

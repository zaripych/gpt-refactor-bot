import type { CommandModule } from 'yargs';

import { type Models, modelsSchema } from '../chat-gpt/api';
import { run } from './run';

export const promptCommand: CommandModule<
    Record<never, never>,
    {
        model: Models;
        watch: boolean;
        manual: boolean;
    }
> = {
    command: 'prompt',
    describe: 'Sends a prompt to the ChatGPT API to generate a response',
    builder: (yargs) =>
        yargs
            .option('model', {
                choices: modelsSchema.options,
                default: 'gpt-3.5-turbo' as const,
            })
            .option('watch', {
                type: 'boolean',
                describe:
                    'Watch for changes in the .md file and automatically send requests to the API',
                default: false,
            })
            .option('manual', {
                type: 'boolean',
                describe:
                    'Prompt for next action confirmation when new messages are received',
                default: false,
            }),
    handler: run,
};

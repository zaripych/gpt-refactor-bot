import yargs from 'yargs';

import { flush } from './logger/logger';
import { promptCommand } from './prompt/cli';
import { refactorCommand } from './refactor/cli';

process.on('uncaughtException', (error) => {
    console.error('Uncaught exception', error);
});
process.on('unhandledRejection', (error) => {
    console.error('Unhandled rejection', error);
});

await yargs(process.argv.slice(2))
    .scriptName('pnpm refactor-bot')
    .command(promptCommand)
    .command(refactorCommand)
    .demandCommand(1, 'You need at least one command before moving on')
    .completion()
    .parseAsync()
    .catch((err) => {
        console.error(err);
    })
    .then(async () => {
        await flush().catch(() => {
            // do nothing
        });
    });

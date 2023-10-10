import yargs from 'yargs';

import { flush } from './logger/logger';
import { promptCommand } from './prompt/cli';
import { refactorCommand } from './refactor/cli';

const result = yargs(process.argv.slice(2))
    .scriptName('pnpm refactor-bot')
    .command(promptCommand)
    .command(refactorCommand)
    .demandCommand(1, 'You need at least one command before moving on')
    .completion();

function run() {
    process.on('uncaughtException', (error) => {
        console.error('Uncaught exception', error);
    });
    process.on('unhandledRejection', (error) => {
        console.error('Unhandled rejection', error);
    });

    void result
        .parseAsync()
        .then(async () => {
            await flush().catch(() => {
                // do nothing
            });
        })
        .catch((err) => {
            console.error(err);
            process.exitCode = 1;
        });
}

run();

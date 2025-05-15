import { formatWithOptions } from 'node:util';

import yargs from 'yargs';

import { flush } from './logger/logger';
import { mcpCommand } from './mcp/cli';
import { promptCommand } from './prompt/cli';
import { refactorCommand } from './refactor/cli';

const result = yargs(process.argv.slice(2))
    .scriptName('pnpm refactor-bot')
    .command(promptCommand)
    .command(refactorCommand)
    .command(mcpCommand)
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
        });
}

run();

import yargs from 'yargs';

import { promptCommand } from './prompt/cli';
import { refactorCommand } from './refactor/cli';

await yargs(process.argv.slice(2))
    .scriptName('pnpm refactor-bot')
    .command(promptCommand)
    .command(refactorCommand)
    .demandCommand(1, 'You need at least one command before moving on')
    .completion()
    .parseAsync()
    .catch((err) => {
        console.error(err);
    });

process.on('uncaughtException', (err) => {
    console.error(err);
});
process.on('unhandledRejection', (err) => {
    console.error(err);
});

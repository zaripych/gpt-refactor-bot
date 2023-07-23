import yargs from 'yargs';

import { promptCommand } from './prompt/cli';

await yargs(process.argv.slice(2))
    .scriptName('pnpm refactor-bot')
    .command(promptCommand)
    .demandCommand(1, 'You need at least one command before moving on')
    .completion()
    .parseAsync();

import type { ArgumentsCamelCase, Argv, CommandModule } from 'yargs';
import yargs from 'yargs';

import { line } from '../text/line';

const builder = (yargs: Argv) =>
    yargs
        .option('id', {
            type: 'string',
            describe: line`
                Unique id of the benchmark run to identify cache directory
            `,
        })
        .option('config', {
            type: 'string',
            describe: line`
                Path to the config yaml file containing benchmark configuration
            `,
            demandOption: true,
        })
        .option('save-to-cache', {
            type: 'boolean',
            describe: line`
                Whether to enable saving results to the cache, by default
                it's enabled.
            `,
            default: true,
            hidden: true,
        })
        .option('enable-cache-for', {
            type: 'string',
            array: true,
            describe: line`
                Disable cache for specific steps - you can specify the name
                of the step or a name followed by a hash of the cache entry.
                This for debugging purposes only.
            `,
            hidden: true,
        })
        .option('disable-cache-for', {
            type: 'string',
            array: true,
            describe: line`
                Disable cache for specific steps - you can specify the name
                of the step or a name followed by a hash of the cache entry.
                This for debugging purposes only.
            `,
            hidden: true,
        });

type Args = {
    config: string;
};

const benchmarkCommand = {
    command: 'benchmark',
    describe: line`
        Performs refactoring using different versions of the refactor bot then
        evaluates the results and compares them.
    `,
    builder,
    handler: async (opts: ArgumentsCamelCase<Args>) => {
        await import('dotenv').then((m) =>
            m.config({
                override: true,
            })
        );
        const { cliHandler } = await import('./cliHandler');
        await cliHandler(opts);
    },
} satisfies CommandModule<Record<never, never>, Args>;

const opts = await builder(yargs(process.argv.slice(2)))
    .usage(benchmarkCommand.describe)
    .parseAsync();

await benchmarkCommand.handler(opts).catch((err) => {
    console.error(err);
    process.exitCode = 1;
});

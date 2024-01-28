import type { CommandModule } from 'yargs';

import { line } from '../text/line';

export const refactorCommand: CommandModule<
    Record<never, never>,
    {
        name?: string;
        id?: string;
        saveToCache?: boolean;
    }
> = {
    command: 'refactor',
    describe: 'Performs a refactoring using Plan and Execute technique',
    builder: (yargs) =>
        yargs
            .option('name', {
                type: 'string',
                describe: 'Name of the refactoring to run',
            })
            .option('id', {
                type: 'string',
                describe: line`
                    Unique id of the refactoring that was previously run but
                    didn't finish - use this to start from last successful step
                `,
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
                    Enable cache for specific steps - you can specify the name
                    of the step or a name followed by a hash of the cache entry.
                    This is for debugging purposes only.
                `,
                hidden: true,
            })
            .option('disable-cache-for', {
                type: 'string',
                array: true,
                describe: line`
                    Disable cache for specific steps - you can specify the name
                    of the step or a name followed by a hash of the cache entry.
                    This is for debugging purposes only.
                `,
                hidden: true,
            })
            .option('costs', {
                type: 'boolean',
                describe: line`
                    Whether to print the total costs of OpenAI requests, by default it's disabled
                `,
                default: false,
            })
            .option('performance', {
                type: 'boolean',
                describe: line`
                    Whether to print performance metrics, by default it's disabled
                `,
                default: false,
            })
            .option('experiment-chunky-edit-strategy', {
                type: 'boolean',
                describe: line`
                    Enables chunky edit strategy where we ask the LLM to send
                    us only the chunks it had modified. This is an experimental
                    feature and it's disabled by default.
                `,
                default: false,
                hidden: true,
            }),
    handler: async (opts) => {
        const { runRefactor } = await import('./runRefactor');
        await runRefactor(opts);
    },
};

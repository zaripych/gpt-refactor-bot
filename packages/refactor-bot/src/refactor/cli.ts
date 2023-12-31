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
                    didn't finish to start from last successful point
                `,
            })
            .option('save-to-cache', {
                type: 'boolean',
                describe: line`
                    Whether to enable saving results to the cache, by default
                    it's enabled
                `,
                default: true,
            })
            .option('enable-cache-for', {
                type: 'string',
                array: true,
                describe: line`
                    Enable cache for specific steps only, can be useful if we
                    want to disable cache for all other steps and replay them
                `,
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
            }),
    handler: async (opts) => {
        const { runRefactor } = await import('./runRefactor');
        await runRefactor(opts);
    },
};

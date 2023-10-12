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
            }),
    handler: async (opts) => {
        const { runRefactor } = await import('./runRefactor');
        await runRefactor(opts);
    },
};

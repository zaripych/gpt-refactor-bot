import type { CommandModule } from 'yargs';

import { line } from '../text/line';
import { runRefactor } from './runRefactor';

export const refactorCommand: CommandModule<
    Record<never, never>,
    {
        name?: string;
        id?: string;
        cache?: boolean;
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
            }),
    handler: async (opts) => {
        await runRefactor(opts);
    },
};

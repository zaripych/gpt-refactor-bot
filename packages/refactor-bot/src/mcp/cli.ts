import { formatWithOptions } from 'node:util';

import type { CommandModule } from 'yargs';

import type { run } from './run';

export const mcpCommand: CommandModule<
    Record<never, never>,
    Parameters<typeof run>[0]
> = {
    command: 'mcp',
    describe: 'Spins up MCP server for a workspace (experimental)',
    builder: (yargs) =>
        yargs
            .option('location', {
                type: 'string',
                describe:
                    'Repository path to provide context to, defaults to current directory',
                default: process.cwd(),
            })
            .option('port', {
                type: 'number',
                describe: 'Port to run the server on',
                default: 3000,
            })
            .option('host', {
                type: 'string',
                describe: 'Interface to run the server on',
                default: '127.0.0.1',
            })
            .option('protocol', {
                type: 'string',
                describe: 'Protocol to use',
                choices: ['stdio', 'http'] as const,
                default: !process.stdin.isTTY
                    ? ('stdio' as const)
                    : ('http' as const),
            }),
    handler: async (opts) => {
        try {
            const { run } = await import('./run');
            await run(opts);
        } catch (err) {
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
        }
    },
};

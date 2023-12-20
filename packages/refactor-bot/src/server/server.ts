import type { SpawnOptionsWithoutStdio } from 'node:child_process';
import { unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import { startServerInCurrentProcess } from './startServerInCurrentProcess';

export const serverProcessArgs = (opts: {
    unixSocketPath: string;
    apiModulePath: string;
    apiPasskey: string;
    apiExportName?: string;
    spawnOpts?: SpawnOptionsWithoutStdio;
}) => {
    const {
        unixSocketPath,
        apiModulePath,
        apiExportName,
        apiPasskey,
        spawnOpts,
    } = opts;

    const serverModulePath = fileURLToPath(import.meta.url);

    const args: string[] = [
        ...(serverModulePath.endsWith('.ts') ? ['--import=tsx/esm'] : []),
        '--experimental-vm-modules',
        fileURLToPath(import.meta.url).toString(),
        '--start-worker-server',
    ];

    const ARGS = JSON.stringify({
        unixSocketPath,
        serverModulePath,
        apiModulePath,
        apiPasskey,
        apiExportName,
    } satisfies z.input<typeof argsSchema>);

    return {
        args,
        spawnOpts: {
            ...spawnOpts,
            env: {
                ARGS,
            },
        },
    };
};

const argsSchema = z.object({
    unixSocketPath: z.string(),
    serverModulePath: z.string(),
    apiModulePath: z.string(),
    apiExportName: z.string().default('api'),
    apiPasskey: z.string(),
});

if (process.argv.includes('--start-worker-server')) {
    const { unixSocketPath, apiModulePath, apiPasskey, apiExportName } =
        argsSchema.parse(JSON.parse(process.env['ARGS'] || '{}'));
    delete process.env['ARGS'];

    process.setUncaughtExceptionCaptureCallback((err) => {
        console.error(`[${process.pid}] Worker process unhandled error: `, err);
        process.exitCode = 2;
    });

    try {
        const { teardown } = await startServerInCurrentProcess({
            unixSocketPath,
            apiModulePath,
            apiExportName,
            apiPasskey,
        });

        const teardownAndUnlink = async () => {
            teardown();
            await unlink(unixSocketPath);
        };

        process.on('SIGINT', () => {
            console.error(`[${process.pid}] Tearing down ... `);
            teardownAndUnlink().catch(() => {
                // do nothing
            });
        });

        process.on('SIGTERM', () => {
            console.error(`[${process.pid}] Tearing down ... `);
            teardownAndUnlink().catch(() => {
                // do nothing
            });
        });
    } catch (err) {
        await unlink(unixSocketPath).catch(() => {
            // do nothing
        });
        console.error(`[${process.pid}] Worker server failed to start: `, err);
        process.exitCode = 1;
    }
}

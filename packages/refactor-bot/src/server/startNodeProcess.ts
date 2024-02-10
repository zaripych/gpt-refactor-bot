import type {
    ChildProcess,
    SpawnOptionsWithoutStdio,
} from 'node:child_process';
import { spawn } from 'node:child_process';
import { EOL } from 'node:os';

import { serverProcessArgs } from './server';

export const startServerInSeparateProcess = async (opts: {
    unixSocketPath: string;
    apiModulePath: string;
    apiExportName: string;
    apiPasskey: string;
}) => startNodeProcess(serverProcessArgs(opts));

export const startNodeProcess = async (opts: {
    args: string[];
    spawnOpts?: SpawnOptionsWithoutStdio;
}) => {
    const output = [] as Buffer[];

    const handleExitCodeAndSignal = (
        code: number | null,
        signal: string | null
    ) => {
        if (typeof code === 'number' && code !== 0) {
            throw new Error(
                `Server process has exited with non-zero error code: ${code}` +
                    EOL +
                    Buffer.concat(output).toString('utf-8')
            );
        }
        if (typeof signal === 'string' && signal) {
            throw new Error(
                `Server process has crashed with "${signal}" signal` +
                    EOL +
                    Buffer.concat(output).toString('utf-8')
            );
        }
    };

    const child = await new Promise<ChildProcess>((res, rej) => {
        const child = spawn(process.execPath, opts.args, opts.spawnOpts);

        child.addListener('exit', (code, signal) => {
            try {
                handleExitCodeAndSignal(code, signal);
            } catch (err) {
                rej(err);
            } finally {
                child.removeAllListeners();
            }
        });

        child.addListener('error', (err) => {
            rej(
                new Error('Worker process failed to start', {
                    cause: err,
                })
            );
            child.removeAllListeners();
        });

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (child.stdout) {
            child.stdout.addListener('data', (data: Buffer) => {
                output.push(data);
            });
        }

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (child.stderr) {
            child.stderr.addListener('data', (data: Buffer) => {
                output.push(data);
            });
        }

        res(child);

        child.addListener('spawn', () => {
            res(child);
        });
    });

    return {
        child,
        checkStatus: () => {
            return handleExitCodeAndSignal(child.exitCode, child.signalCode);
        },
        teardown: () => {
            child.removeAllListeners();
            child.kill();
        },
        output: () => Buffer.concat(output).toString('utf-8'),
    };
};

import assert from 'assert';

import { logger } from '../logger/logger';
import { ensureHasOneElement } from '../utils/hasOne';
import { UnreachableError } from '../utils/UnreachableError';
import type { SpawnParameterMix, SpawnToPromiseOpts } from './spawnToPromise';
import { spawnToPromise, spawnWithSpawnParameters } from './spawnToPromise';

export type SpawnResultOpts = {
    output?:
        | Array<'stdout' | 'stderr'>
        | ['stdout' | 'stderr', ...Array<'stdout' | 'stderr'>];
    buffers?: {
        combined?: string[];
        stdout?: string[];
        stderr?: string[];
    };
    logOnError?: 'stdout' | 'stderr' | 'combined';
} & SpawnToPromiseOpts;

export type SpawnResultReturn = {
    pid?: number;
    output: string[];
    stdout: string;
    stderr: string;
    status: number | null;
    signal: NodeJS.Signals | null;
    error?: Error | undefined;
    args: [string, ...string[]];
};

export async function spawnResult(
    ...parameters: SpawnParameterMix<SpawnResultOpts>
): Promise<SpawnResultReturn> {
    const { child, opts } = spawnWithSpawnParameters(parameters);
    const combinedData: string[] = opts.buffers?.combined ?? [];
    const stdoutData: string[] = opts.buffers?.stdout ?? [];
    const stderrData: string[] = opts.buffers?.stderr ?? [];
    const output = opts.output ?? ['stdout', 'stderr'];

    if (output.includes('stdout')) {
        assert(
            !!child.stdout,
            'Expected ".stdout" to be defined, which will only be defined if child process is spawned with correct parameters'
        );
        child.stdout.setEncoding('utf-8');
        child.stdout.on('data', (data: string) => {
            combinedData.push(data);
            stdoutData.push(data);
        });
    }

    if (output.includes('stderr')) {
        assert(
            !!child.stderr,
            'Expected ".stderr" to be defined, which will only be defined if child process is spawned with correct parameters'
        );
        child.stderr.setEncoding('utf-8');
        child.stderr.on('data', (data: string) => {
            combinedData.push(data);
            stderrData.push(data);
        });
    }

    const [result] = await Promise.allSettled([spawnToPromise(child, opts)]);
    if (result.status === 'rejected' && opts.logOnError) {
        switch (opts.logOnError) {
            case 'stdout':
                logger.error(stdoutData.join(''));
                break;
            case 'stderr':
                logger.error(stderrData.join(''));
                break;
            case 'combined':
                logger.error(combinedData.join(''));
                break;
            default:
                throw new UnreachableError(opts.logOnError);
        }

        if (opts.exitCodes !== 'any') {
            throw result.reason;
        }
    }

    return {
        pid: child.pid,
        signal: child.signalCode,
        status: child.exitCode,
        get args(): [string, ...string[]] {
            return ensureHasOneElement(child.spawnargs);
        },
        get output() {
            return combinedData;
        },
        get stderr() {
            return stderrData.join('');
        },
        get stdout() {
            return stdoutData.join('');
        },
        get error() {
            return result.status === 'rejected'
                ? (result.reason as Error)
                : undefined;
        },
    };
}

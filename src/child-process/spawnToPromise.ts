import type { SpawnOptions } from 'child_process';
import { ChildProcess, spawn } from 'child_process';
import type { Assign } from 'utility-types';

import { logger } from '../logger/logger';
import { captureStackTrace } from '../utils/captureStackTrace';
import { firstLineOf } from '../utils/firstLineOf';

export type SpawnToPromiseOpts = {
    /**
     * Specify exit codes which should not result in throwing an error when
     * the process has finished, e.g. specifying `[0]` means if process finished
     * with zero exit code then the promise will resolve instead of rejecting.
     *
     * Alternatively, specify `inherit` to save status code to the current `process.exitCode`
     *
     * Alternatively, completely ignore the exit code (e.g. you follow up and interrogate
     * the process code manually afterwards)
     */
    exitCodes: number[] | 'inherit' | 'any';
    disableLogs?: boolean;
};

type SharedOpts = Pick<SpawnOptions, 'cwd'>;

type SpawnArgs<E extends object> = [
    command: string,
    args: ReadonlyArray<string>,
    options: Assign<SpawnOptions, E>
];

export type SpawnOptionsWithExtra<E extends object = SpawnToPromiseOpts> =
    Assign<SpawnOptions, E>;

export type SpawnParameterMix<E extends object = SpawnToPromiseOpts> =
    | [cp: ChildProcess, extraOpts: Assign<E, SharedOpts>]
    | SpawnArgs<E>;

export function isSpawnArgs<E extends object>(
    args: SpawnParameterMix<E>
): args is SpawnArgs<E> {
    return !(args[0] instanceof ChildProcess) && typeof args[0] === 'string';
}

export function spawnWithSpawnParameters<E extends object>(
    parameters: SpawnParameterMix<E>
) {
    const [child, [command, args, opts]] = isSpawnArgs(parameters)
        ? [
              spawn(...(parameters as unknown as Parameters<typeof spawn>)),
              parameters,
          ]
        : [
              parameters[0],
              [
                  parameters[0].spawnfile,
                  parameters[0].spawnargs.slice(1),
                  parameters[1] as Assign<SpawnOptions, E>,
              ],
          ];
    return {
        child,
        command,
        args,
        opts,
    };
}

export async function spawnToPromise(
    ...parameters: SpawnParameterMix
): Promise<void> {
    const { child, command, args, opts } = spawnWithSpawnParameters(parameters);

    const { exitCodes } = opts;

    const cwd = opts.cwd ? opts.cwd.toString() : undefined;

    const cmd = () => firstLineOf([command, ...args].join(' '), '...');

    if (!opts.disableLogs) {
        logger.debug(['>', cmd()].join(' '), ...(cwd ? [`in ${cwd}`] : []));
    }

    const stack = captureStackTrace();

    await new Promise<void>((res, rej) => {
        child
            .on('close', (code, signal) => {
                if (typeof code === 'number') {
                    if (
                        exitCodes !== 'inherit' &&
                        exitCodes !== 'any' &&
                        !exitCodes.includes(code)
                    ) {
                        rej(
                            stack.prepareForRethrow(
                                new Error(
                                    `Command "${cmd()}" has failed with code ${code}`
                                )
                            )
                        );
                    } else {
                        res();
                    }
                } else if (signal) {
                    rej(
                        stack.prepareForRethrow(
                            new Error(
                                `Failed to execute command "${cmd()}" - ${signal}`
                            )
                        )
                    );
                } else {
                    throw new Error('Expected signal or error code');
                }
            })
            .on('error', (err) => {
                rej(stack.prepareForRethrow(err));
            });
    });
    // inherit exit code
    if (exitCodes === 'inherit') {
        if (
            typeof child.exitCode === 'number' &&
            (typeof process.exitCode !== 'number' || process.exitCode === 0)
        ) {
            process.exitCode = child.exitCode;
        }
    }
}

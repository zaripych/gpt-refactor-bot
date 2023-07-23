import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';

import { disableGlow, isGlowEnabled } from './isGlowEnabled';

function fallbackFormat(input: string) {
    return input;
}

export const glowFormatDefaultDeps = {
    isGlowEnabled,
    disableGlow,
    fallbackFormat,
};

function spawnOutput(cp: ChildProcess) {
    const { stdout } = cp;
    if (!stdout) {
        throw new Error(`No stdout`);
    }
    return new Promise<string>((res, rej) => {
        let output = '';
        stdout.on('data', (data) => {
            output += data;
        });
        cp.once('exit', (code, signal) => {
            if (code === 0) {
                res(output);
            } else if (typeof code === 'number') {
                rej(new Error(`Failed with ${String(code)}`));
            } else if (typeof signal === 'string') {
                rej(new Error(`Failed with ${signal}`));
            } else {
                rej(new Error('Failed'));
            }
        });
    });
}

export async function glowFormat(
    {
        input,
        style = 'auto',
        command = 'glow',
        args,
    }: {
        input: string;
        style?: 'auto' | 'dark' | 'light' | 'drakula' | 'notty';
        command?: string;
        args?: string[];
    },
    depsRaw?: Partial<typeof glowFormatDefaultDeps>
) {
    const deps = { ...glowFormatDefaultDeps, ...depsRaw };
    const glowEnabled = deps.isGlowEnabled();
    if (!glowEnabled) {
        return deps.fallbackFormat(input);
    }

    const width = Math.max(40, Math.min(process.stdout.columns, 120));

    const child = spawn(
        command,
        args ?? ['-', '-s', style, '--width', String(width)],
        {
            stdio: 'pipe',
        }
    );

    child.stdin.setDefaultEncoding('utf-8');

    const writeToStdin = () =>
        new Promise<void>((res, rej) => {
            child.stdin.write(input, (err) => {
                if (err) {
                    rej(err);
                } else {
                    child.stdin.end(res);
                }
            });
        });

    const [result] = await Promise.all([
        spawnOutput(child),
        writeToStdin(),
    ]).catch(() => {
        deps.disableGlow();
        return [deps.fallbackFormat(input)];
    });

    return result;
}

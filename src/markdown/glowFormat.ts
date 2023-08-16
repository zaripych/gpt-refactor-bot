import { spawn } from 'node:child_process';

import { spawnResult } from '../child-process/spawnResult';
import { disableGlow, isGlowEnabled } from './isGlowEnabled';

function fallbackFormat(input: string) {
    return input;
}

export const glowFormatDefaultDeps = {
    isGlowEnabled,
    disableGlow,
    fallbackFormat,
};

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

    const cols = Number.isFinite(process.stdout.columns)
        ? process.stdout.columns
        : 80;
    const width = Math.max(40, Math.min(cols, 120));

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

    try {
        const [result] = await Promise.all([
            spawnResult(child, {
                exitCodes: [0],
                disableLogs: true,
            }),
            writeToStdin(),
        ]);
        return result.stdout;
    } catch (err) {
        deps.disableGlow();
        return [deps.fallbackFormat(input)];
    }
}

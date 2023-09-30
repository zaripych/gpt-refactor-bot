import { spawn } from 'node:child_process';

import { disableGlow, isGlowEnabled } from './isGlowEnabled';

function write(text: string) {
    process.stdout.write(text);
}

export const glowPrintDefaultDeps = {
    isGlowEnabled,
    disableGlow,
    write,
};

export async function glowPrint(
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
    depsRaw?: Partial<typeof glowPrintDefaultDeps>
) {
    const deps = { ...glowPrintDefaultDeps, ...depsRaw };

    function fallbackPrint(text: string) {
        deps.write(`\n${text.replace(/^/gm, '  ')}\n\n`);
    }

    const glowEnabled = deps.isGlowEnabled();
    if (!glowEnabled) {
        fallbackPrint(input);
        return;
    }

    const width = Math.max(40, Math.min(process.stdout.columns, 120));

    const child = spawn(
        command,
        args ?? ['-', '-s', style, '--width', String(width), '-l'],
        {
            stdio: ['pipe', 'inherit', 'inherit'],
        }
    );

    child.stdin.setDefaultEncoding('utf-8');

    const waitToSpawn = () =>
        new Promise<void>((res, rej) => {
            child.once('spawn', res);
            child.once('error', rej);
        });

    const waitToFinish = () =>
        new Promise<void>((res, rej) => {
            child.once('exit', (code, signal) => {
                if (code === 0) {
                    res();
                } else if (typeof code === 'number') {
                    rej(new Error(`Failed with ${String(code)}`));
                } else if (typeof signal === 'string') {
                    rej(new Error(`Failed with ${String(signal)}`));
                }
            });
            child.once('error', rej);
        });

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

    const onFailure = () => {
        deps.disableGlow();
        fallbackPrint(input);
    };

    await Promise.all([
        waitToSpawn().then(
            () => writeToStdin().then(() => waitToFinish().catch(onFailure)),
            onFailure
        ),
    ]);
}

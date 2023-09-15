import { spawn } from 'child_process';
import { z } from 'zod';

import { spawnResult } from '../child-process/spawnResult';
import { determinePackageManager } from '../package-manager/determinePackageManager';
import { runPackageManagerScript } from '../package-manager/runPackageManagerScript';

export async function autoFixIssues(opts: {
    location: string;
    eslintScriptArgs: [string, ...string[]];
    filePaths: string[];
}) {
    const packageManager = await determinePackageManager({
        directory: opts.location,
    });

    const args = opts.eslintScriptArgs.slice(1);

    if (!args.includes('--fix')) {
        args.push('--fix');
    }

    args.push(...opts.filePaths);

    return await runPackageManagerScript({
        packageManager,
        location: opts.location,
        script: opts.eslintScriptArgs[0],
        args,
        logOnError: 'combined',
    });
}

export async function autoFixIssuesContents(opts: {
    location: string;
    eslintScriptArgs: [string, ...string[]];
    fileContents: string;
    filePath: string;
}) {
    const packageManager = await determinePackageManager({
        directory: opts.location,
    });

    const args = opts.eslintScriptArgs.slice(1);

    const fixArg = args.findIndex((arg) => arg === '--fix');
    args.splice(fixArg, 1);

    const formatArg = args.findIndex((arg) => arg === '--format');
    args.splice(formatArg, 2);

    args.push('--fix-dry-run');
    args.push('--format');
    args.push('json');
    args.push('--stdin');
    args.push('--stdin-filename');
    args.push(opts.filePath);

    let extras: string[];
    switch (packageManager) {
        case 'yarn':
            extras = ['--silent', 'exec', '--'];
            break;
        case 'npm':
            extras = ['--quiet', 'exec', '--'];
            break;
        case 'pnpm':
            extras = ['--silent', 'exec', '--'];
            break;
    }

    const child = spawn(
        packageManager as string,
        [...extras, opts.eslintScriptArgs, ...args] as string[],
        {
            cwd: opts.location,
            env: {
                ...process.env,
                LOG_LEVEL: 'error',
            },
            stdio: ['pipe', 'pipe', 'pipe'],
        }
    );

    const writeToStdin = () =>
        new Promise<void>((res, rej) => {
            child.stdin.write(opts.fileContents, (err) => {
                if (err) {
                    child.stdin.end();
                    rej(err);
                } else {
                    child.stdin.end(res);
                }
            });
        });

    const [result] = await Promise.all([
        spawnResult(child, {
            cwd: opts.location,
            exitCodes: 'any',
            logOnError: 'combined',
        }),
        writeToStdin(),
    ]);

    const [first] = z
        .array(
            z
                .object({
                    filePath: z.string(),
                    output: z.string().default(opts.fileContents),
                })
                .passthrough()
        )
        .nonempty()
        .parse(JSON.parse(result.stdout));

    return first.output;
}

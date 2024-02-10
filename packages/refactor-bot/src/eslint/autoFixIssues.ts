import { spawn } from 'child_process';
import { z } from 'zod';

import { makeCachedFunction } from '../cache/makeCachedFunction';
import { spawnResult } from '../child-process/spawnResult';
import { logger } from '../logger/logger';
import { determinePackageManager } from '../package-manager/determinePackageManager';

const autoFixIssuesContentsInputSchema = z.object({
    location: z.string(),
    eslintScriptArgs: z.array(z.string()).nonempty(),
    filePath: z.string(),
    fileContents: z.string(),
});

export const autoFixIssuesContents = makeCachedFunction({
    name: 'auto-fix',
    type: 'deterministic',
    inputSchema: autoFixIssuesContentsInputSchema,
    resultSchema: z.object({
        contents: z.string(),
    }),
    transform: async (
        opts: z.output<typeof autoFixIssuesContentsInputSchema>
    ) => {
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

        if (result.stderr) {
            logger.error('Failed to auto-fix issues', result.stderr);

            return {
                contents: opts.fileContents,
            };
        }

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

        return {
            contents: first.output,
        };
    },
});

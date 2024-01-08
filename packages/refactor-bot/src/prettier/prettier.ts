import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import { join } from 'path';
import { z } from 'zod';

import { spawnResult } from '../child-process/spawnResult';
import { findRefactorBotPackageRoot } from '../file-system/findRefactorBotPackageRoot';
import { logger } from '../logger/logger';
import { line } from '../text/line';

export async function findPrettierScriptLocation(opts: { location: string }) {
    const { location } = opts;

    const npmPackage = join(location, 'node_modules', 'prettier');

    try {
        const pkgContent = await readFile(
            join(npmPackage, 'package.json'),
            'utf-8'
        );

        const pkg = z
            .string()
            .transform((content) => JSON.parse(content) as unknown)
            .pipe(
                z.object({
                    name: z.literal('prettier'),
                    bin: z.string(),
                })
            )
            .parse(pkgContent);

        return join(npmPackage, pkg.bin);
    } catch (err) {
        if (
            typeof err === 'object' &&
            err &&
            'code' in err &&
            err.code === 'ENOENT'
        ) {
            return undefined;
        }
        throw err;
    }
}

const warn = (message: string, ...args: unknown[]) =>
    logger.warn(message, ...args);

const defaultDeps = {
    warn,
};

const prettierFormat = async (
    opts: {
        prettierScriptLocation?: string;
        repositoryRoot: string;
        input: string;
        filePath: string;
    },
    deps = defaultDeps
) => {
    const scriptLocation = opts.prettierScriptLocation
        ? opts.prettierScriptLocation
        : (await findPrettierScriptLocation({
              location: opts.repositoryRoot,
          })) ||
          (await findPrettierScriptLocation({
              location: findRefactorBotPackageRoot(),
          }));

    if (!scriptLocation) {
        throw new Error(
            line`
                Cannot find prettier script location in the sandbox repository
                root "${opts.repositoryRoot}" or in the refactor-bot package
                root "${findRefactorBotPackageRoot()}
            `
        );
    }

    const child = spawn(
        process.execPath,
        [scriptLocation, '--stdin-filepath', opts.filePath],
        {
            stdio: 'pipe',
            cwd: opts.repositoryRoot,
        }
    );

    child.stdin.setDefaultEncoding('utf-8');

    const writeToStdin = (input: string) =>
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
        spawnResult(child, {
            exitCodes: [0],
        }),
        writeToStdin(opts.input),
    ]);

    if (result.stderr) {
        deps.warn('Prettier failed to format', { stderr: result.stderr });
        return opts.input;
    }

    return result.stdout;
};

export async function prettierMarkdown(
    opts: {
        prettierScriptLocation?: string;
        repositoryRoot: string;
        filePath?: string;
        md: string;
    },
    deps = defaultDeps
) {
    return await prettierFormat(
        {
            filePath: opts.filePath ?? 'output.md',
            prettierScriptLocation: opts.prettierScriptLocation,
            repositoryRoot: opts.repositoryRoot,
            input: opts.md,
        },
        deps
    );
}

export async function prettierTypescript(
    opts: {
        prettierScriptLocation?: string;
        repositoryRoot: string;
        filePath?: string;
        ts: string;
    },
    deps = defaultDeps
) {
    return await prettierFormat(
        {
            filePath: opts.filePath ?? 'output.ts',
            prettierScriptLocation: opts.prettierScriptLocation,
            repositoryRoot: opts.repositoryRoot,
            input: opts.ts,
        },
        deps
    );
}

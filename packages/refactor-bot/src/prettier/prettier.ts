import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import { join } from 'path';
import { z } from 'zod';

import { spawnResult } from '../child-process/spawnResult';
import { findRefactorBotPackageRoot } from '../file-system/findRefactorBotPackageRoot';
import { logger } from '../logger/logger';

async function findPrettierScriptLocation(opts: { location: string }) {
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
        throw new Error(`Could not find prettier package at "${npmPackage}"`, {
            cause: err,
        });
    }
}

const warn = (message: string, ...args: unknown[]) =>
    logger.warn(message, ...args);

const defaultDeps = {
    warn,
};

const prettierFormat = async (
    opts: {
        prettierLocation?: string;
        repositoryRoot: string;
        input: string;
        filePath: string;
    },
    deps = defaultDeps
) => {
    const scriptLocation = await findPrettierScriptLocation({
        location: opts.prettierLocation ?? findRefactorBotPackageRoot(),
    });

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
        prettierLocation?: string;
        repositoryRoot: string;
        filePath?: string;
        md: string;
    },
    deps = defaultDeps
) {
    return await prettierFormat(
        {
            filePath: opts.filePath ?? 'output.md',
            prettierLocation: opts.prettierLocation,
            repositoryRoot: opts.repositoryRoot,
            input: opts.md,
        },
        deps
    );
}

export async function prettierTypescript(
    opts: {
        prettierLocation?: string;
        repositoryRoot: string;
        filePath?: string;
        ts: string;
    },
    deps = defaultDeps
) {
    return await prettierFormat(
        {
            filePath: opts.filePath ?? 'output.ts',
            prettierLocation: opts.prettierLocation,
            repositoryRoot: opts.repositoryRoot,
            input: opts.ts,
        },
        deps
    );
}

import { readFile } from 'fs/promises';
import { globby } from 'globby';
import { join } from 'path';
import { z } from 'zod';

import { spawnResult } from '../../child-process/spawnResult';
import { findRepositoryRoot } from '../../file-system/findRepositoryRoot';
import { readPackagesGlobsAt } from '../../file-system/readPackagesGlobsAt';

export async function discoverDependencies(opts: {
    location: string;
    ignore?: string[];
    ignoreFiles?: string[];
}) {
    const repositoryRoot = await findRepositoryRoot(opts.location);
    const packageJson = await readFile(
        join(repositoryRoot, 'package.json'),
        'utf-8'
    );

    const { dependencies, devDependencies } = z
        .string()
        .transform((arg) => JSON.parse(arg) as unknown)
        .pipe(
            z.object({
                dependencies: z.record(z.string()).default({}),
                devDependencies: z.record(z.string()).default({}),
            })
        )
        .parse(packageJson);

    const allDeps = new Set([
        ...Object.keys(dependencies),
        ...Object.keys(devDependencies),
    ]);

    const prettier = allDeps.has('prettier');

    const [prettierConfigs, { isMonorepo, packagesGlobs }] = await Promise.all([
        globby('*prettier*', {
            cwd: repositoryRoot,
            dot: true,
            ignore: opts.ignore,
            ignoreFiles: opts.ignoreFiles,
        }),
        readPackagesGlobsAt(repositoryRoot),
    ]);

    const tools = ['code', 'git', 'glow'] as const;

    const toolConfigs = new Map(
        await Promise.all(
            tools.map((tool) =>
                spawnResult('which', [tool], { exitCodes: 'any' }).then(
                    (result) => [tool, result.status === 0] as const
                )
            )
        )
    );

    return {
        prettier: prettier || prettierConfigs.length > 0,
        hasCode: Boolean(toolConfigs.get('code')),
        hasGit: Boolean(toolConfigs.get('git')),
        hasGlow: Boolean(toolConfigs.get('glow')),
        isMonorepo,
        packagesGlobs,
    };
}

export async function discoverCheckDependencies(opts: {
    location: string;
    ignore?: string[];
    ignoreFiles?: string[];
}) {
    const repositoryRoot = await findRepositoryRoot(opts.location);
    const packageJson = await readFile(
        join(repositoryRoot, 'package.json'),
        'utf-8'
    );

    const { dependencies, devDependencies } = z
        .string()
        .transform((arg) => JSON.parse(arg) as unknown)
        .pipe(
            z.object({
                dependencies: z.record(z.string()).default({}),
                devDependencies: z.record(z.string()).default({}),
            })
        )
        .parse(packageJson);

    const allDeps = new Set([
        ...Object.keys(dependencies),
        ...Object.keys(devDependencies),
    ]);

    const eslint = allDeps.has('eslint');
    const jest =
        allDeps.has('jest') ||
        allDeps.has('@jest/globals') ||
        allDeps.has('@jest/types');
    const tsc = allDeps.has('typescript');

    const [eslintConfigs, jestConfigs, tsConfigs] = await Promise.all([
        globby('*eslint*', {
            cwd: repositoryRoot,
            dot: true,
            ignore: opts.ignore,
            ignoreFiles: opts.ignoreFiles,
        }),
        globby('*jest*', {
            cwd: repositoryRoot,
            ignore: opts.ignore,
            ignoreFiles: opts.ignoreFiles,
        }),
        globby('*tsconfig*', {
            cwd: repositoryRoot,
            ignore: opts.ignore,
            ignoreFiles: opts.ignoreFiles,
        }),
    ]);

    return {
        eslint: eslint || eslintConfigs.length > 0,
        jest: jest || jestConfigs.length > 0,
        tsc: tsc || tsConfigs.length > 0,
    };
}

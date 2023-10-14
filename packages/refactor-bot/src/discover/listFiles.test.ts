import { expect, it } from '@jest/globals';
import { globby } from 'globby';
import { join } from 'path';

import { findRefactorBotPackageRoot } from '../file-system/findRefactorBotPackageRoot';
import { measure } from '../utils/perf';
import { sortPaths } from './helpers/sortPaths';
import { listFiles } from './listFiles';

const ignore = ['.git', '**/node_modules'];

const search = async (opts: { repositoryRoot: string; patterns: string[] }) => {
    return await globby(opts.patterns, {
        dot: true,
        cwd: opts.repositoryRoot,
        expandDirectories: false,
        ignore,
        gitignore: true,
    });
};

it('should work for the repository root', async () => {
    const repositoryRoot = join(findRefactorBotPackageRoot(), '../../');

    const gitLsResult = await listFiles(
        { max: Number.MAX_SAFE_INTEGER },
        { repositoryRoot }
    );

    const globbySearchResult = await measure(search, {
        repositoryRoot,
        patterns: ['**/*'],
    });

    expect(sortPaths([...gitLsResult.filePaths]).join('\n')).toBe(
        sortPaths([...globbySearchResult]).join('\n')
    );
});

it('should work for a sub directories', async () => {
    const repositoryRoot = join(findRefactorBotPackageRoot(), '../../');

    const patterns = ['packages/*/src/*/discover/*.ts'];

    const gitLsResult = await measure(
        listFiles,
        { max: Number.MAX_SAFE_INTEGER, patterns },
        { repositoryRoot }
    );

    const globbySearchResult = await measure(search, {
        repositoryRoot,
        patterns,
    });

    expect(sortPaths([...gitLsResult.filePaths]).join('\n')).toBe(
        sortPaths([...globbySearchResult]).join('\n')
    );
});

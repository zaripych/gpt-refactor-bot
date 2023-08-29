import assert from 'assert';
import { stat } from 'fs/promises';
import { globby } from 'globby';
import { join } from 'path';

import { iterateDirectoriesUp } from './iterateDirectoriesUp';

export async function findRepositoryRoot(startAt = process.cwd()) {
    const repoRoot = await iterateDirectoriesUp(startAt, async (directory) => {
        const contents = await globby(
            [
                '.git',
                'yarn.lock',
                'pnpm-lock.yaml',
                'pnpm-workspace.yaml',
                'npm-shrinkwrap.json',
                'package-lock.json',
            ],
            {
                cwd: directory,
                onlyFiles: false,
                dot: true,
            }
        );

        if (contents.length > 0) {
            return directory;
        }

        return undefined;
    });
    assert(
        repoRoot,
        `Could not find a repository root starting from "${startAt}"`
    );
    const result = await stat(join(repoRoot, 'package.json'));
    assert(
        result.isFile(),
        `Could not find a package.json file in a candidate repository root "${repoRoot}"`
    );
    return repoRoot;
}

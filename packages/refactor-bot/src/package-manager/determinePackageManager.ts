import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { spawnResult } from '../child-process/spawnResult';

function packageManagerFromPackageJson(packageJson: Record<string, unknown>) {
    const pkgMgr = packageJson['packageManager'];
    if (typeof pkgMgr !== 'string') {
        return;
    }
    const valid = ['pnpm', 'yarn', 'npm'];
    const result = new RegExp(`(${valid.join('|')})(@.+)?`).exec(pkgMgr);
    if (!result) {
        return;
    }
    return result[1] as 'yarn' | 'pnpm' | 'npm';
}

async function packageManagerFromFs(directory: string) {
    const contents = await readdir(directory);
    const managerByLockFile: Record<string, 'yarn' | 'pnpm' | 'npm'> = {
        'yarn.lock': 'yarn',
        'pnpm-lock.yaml': 'pnpm',
        'package-lock.json': 'npm',
    };
    const result = contents.find((file) => !!managerByLockFile[file]);
    if (!result) {
        return;
    }
    return managerByLockFile[result];
}

export async function determinePackageManager(opts: {
    directory: string;
    default?: 'pnpm' | 'npm' | 'yarn';
}) {
    const path = join(opts.directory, 'package.json');
    const packageJsonContents = await readFile(path, 'utf-8');
    const packageJson = JSON.parse(packageJsonContents) as Record<
        string,
        unknown
    >;
    const [fromPackageJson, fromFs] = await Promise.all([
        packageManagerFromPackageJson(packageJson),
        packageManagerFromFs(opts.directory),
    ]);
    return (
        fromPackageJson ||
        fromFs ||
        opts.default ||
        (await spawnResult('which', ['pnpm'], { exitCodes: [0] }).then(
            () => 'pnpm',
            () => 'npm'
        ))
    );
}

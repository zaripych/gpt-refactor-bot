import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { load } from 'js-yaml';

async function tryReadingPnpmWorkspaceYaml(repoRoot: string) {
    const text = await readFile(join(repoRoot, 'pnpm-workspace.yaml'), 'utf-8');
    const rootPath = load(text) as {
        packages?: string[];
    };
    return Array.isArray(rootPath.packages) && rootPath.packages.length > 0
        ? rootPath.packages
        : undefined;
}

async function tryReadingPackageJsonWorkspaces(repoRoot: string) {
    const text = await readFile(join(repoRoot, 'package.json'), 'utf-8');
    const packageJson = JSON.parse(text) as {
        workspaces?: string[];
    };
    return Array.isArray(packageJson.workspaces) &&
        packageJson.workspaces.length > 0
        ? packageJson.workspaces
        : undefined;
}

export const readPackagesGlobsAt = async (repoRoot: string) => {
    const [pnpmWorkspaces, packageJsonWorkspaces] = await Promise.all([
        tryReadingPnpmWorkspaceYaml(repoRoot).catch(() => undefined),
        tryReadingPackageJsonWorkspaces(repoRoot).catch(() => undefined),
    ]);
    return pnpmWorkspaces || packageJsonWorkspaces || ['package.json'];
};

import fg from 'fast-glob';
import { orderBy } from 'lodash-es';
import { basename, dirname } from 'path';

import { findPackageName } from '../file-system/findPackageName';
import { findRepositoryRoot } from '../file-system/findRepositoryRoot';
import { readPackagesGlobsAt } from '../file-system/readPackagesGlobsAt';

export async function createProject(opts?: {
    repoRoot?: string;
    scope?: string[];
}) {
    const repoRoot = opts?.repoRoot ?? (await findRepositoryRoot());

    const scope = opts?.scope;

    const { Project } = await import('ts-morph');

    const packages = await readPackagesGlobsAt(repoRoot);

    const typescriptPackages = await fg(
        packages.map((p) => `${p}/tsconfig.json`),
        {
            cwd: repoRoot,
            absolute: true,
        }
    );

    const unsortedPackageInfo = await Promise.all(
        typescriptPackages.map(async (tsconfig) => ({
            tsconfig,
            dirName: basename(dirname(tsconfig)),
            packageName: await findPackageName(tsconfig),
        }))
    );

    const packageInfo = orderBy(unsortedPackageInfo, [
        scope
            ? (p) => {
                  const index = scope.findIndex(
                      (s) => p.packageName?.includes(s) || p.dirName.includes(s)
                  );
                  if (index < 0) {
                      return scope.length;
                  }
                  return index;
              }
            : 'dirName',
    ]);

    if (!packageInfo[0]) {
        throw new Error('Cannot find any packages');
    }

    const project = new Project({
        tsConfigFilePath: packageInfo[0].tsconfig,
    });

    for (const { tsconfig, dirName, packageName } of packageInfo.slice(1)) {
        if (
            !scope ||
            (packageName && scope.some((s) => packageName.includes(s))) ||
            scope.some((s) => dirName.includes(s))
        ) {
            project.addSourceFilesFromTsConfig(tsconfig);
        }
    }

    return {
        project,
        repoRoot,
    };
}

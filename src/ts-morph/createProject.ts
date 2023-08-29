import { globby } from 'globby';
import { orderBy } from 'lodash-es';
import { basename, dirname } from 'path';

import { ConfigurationError } from '../errors/configurationError';
import { findPackageName } from '../file-system/findPackageName';
import { readPackagesGlobsAt } from '../file-system/readPackagesGlobsAt';
import {
    type FunctionsConfig,
    functionsConfigSchema,
} from '../functions/types';
import { logger } from '../logger/logger';

export async function createProject(opts: FunctionsConfig) {
    const { repositoryRoot } = functionsConfigSchema.parse(opts);

    const scope = opts.scope;

    const { Project } = await import('ts-morph');

    const { isMonorepo, packagesGlobs } = await readPackagesGlobsAt(
        repositoryRoot
    );

    if (isMonorepo) {
        logger.debug(`Found monorepo packages globs`, {
            packagesGlobs,
        });
    }

    const tsconfigJsonFileName = opts.tsconfigJsonFileName ?? 'tsconfig.json';

    const typescriptPackages = await globby(
        packagesGlobs.map((p) => `${p}/${tsconfigJsonFileName}`),
        {
            cwd: repositoryRoot,
            absolute: true,
            ignore: opts.ignore,
            ignoreFiles: opts.ignoreFiles,
        }
    );

    logger.debug(`Found typescript packages`, {
        typescriptPackages,
    });

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
        throw new ConfigurationError(
            'Cannot find any packages with tsconfig.json'
        );
    }

    logger.debug(`Using tsconfig.json as first project`, {
        firstTsConfigJson: packageInfo[0].tsconfig,
    });

    const project = new Project({
        tsConfigFilePath: packageInfo[0].tsconfig,
    });

    for (const { tsconfig, dirName, packageName } of packageInfo.slice(1)) {
        if (
            !scope ||
            (packageName && scope.some((s) => packageName.includes(s))) ||
            scope.some((s) => dirName.includes(s))
        ) {
            logger.debug(`Adding tsconfig.json at`, {
                tsconfig,
            });

            try {
                project.addSourceFilesFromTsConfig(tsconfig);
            } catch (err) {
                logger.error(`Failed to add tsconfig.json at`, {
                    tsconfig,
                    err,
                });
            }
        }
    }

    return {
        project,
        repositoryRoot,
    };
}

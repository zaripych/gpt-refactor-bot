import { globby } from 'globby';
import orderBy from 'lodash-es/orderBy';
import { basename, dirname } from 'path';

import { ConfigurationError } from '../../errors/configurationError';
import { findPackageName } from '../../file-system/findPackageName';
import { readPackagesGlobsAt } from '../../file-system/readPackagesGlobsAt';
import {
    type FunctionsConfig,
    functionsConfigSchema,
} from '../../functions/types';
import { logger } from '../../logger/logger';
import { line } from '../../text/line';

export async function listProjects(config: FunctionsConfig) {
    const { repositoryRoot, scope } = functionsConfigSchema.parse(config);

    const { isMonorepo, packagesGlobs } =
        await readPackagesGlobsAt(repositoryRoot);

    if (isMonorepo) {
        logger.debug(`Found monorepo packages globs`, {
            packagesGlobs,
        });
    }

    const tsconfigJsonFileName = config.tsConfigJsonFileName ?? 'tsconfig.json';

    const typescriptPackages = await globby(
        packagesGlobs.map((p) => `${p}/${tsconfigJsonFileName}`),
        {
            cwd: repositoryRoot,
            absolute: true,
            ignore: config.ignore,
            ignoreFiles: config.ignoreFiles,
        }
    );

    logger.debug(`Found typescript packages`, {
        typescriptPackages,
    });

    const unsortedPackageInfo = await Promise.all(
        typescriptPackages.map(async (tsConfigFilePath) => ({
            tsConfigFilePath,
            directoryPath: dirname(tsConfigFilePath),
            directoryName: basename(dirname(tsConfigFilePath)),
            packageName: await findPackageName(tsConfigFilePath),
        }))
    );

    const projects = orderBy(unsortedPackageInfo, [
        scope
            ? (p) => {
                  const index = scope.findIndex(
                      (s) =>
                          p.packageName?.includes(s) ||
                          p.directoryName.includes(s)
                  );
                  if (index < 0) {
                      return scope.length;
                  }
                  return index;
              }
            : 'directoryName',
    ]);

    if (projects.length === 0) {
        throw new ConfigurationError(line`
            No TypeScript projects found - cannot find any npm packages with
            tsconfig.json
        `);
    }

    return projects;
}

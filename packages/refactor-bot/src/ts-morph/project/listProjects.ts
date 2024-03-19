import { globby } from 'globby';
import orderBy from 'lodash-es/orderBy';
import { basename, dirname } from 'path';
import type { z } from 'zod';

import { ConfigurationError } from '../../errors/configurationError';
import { findPackage } from '../../file-system/findPackage';
import { readPackagesGlobsAt } from '../../file-system/readPackagesGlobsAt';
import { functionsConfigSchema } from '../../functions/types';
import { logger } from '../../logger/logger';
import { line } from '../../text/line';
import type { typeScriptProjectsLookupConfigSchema } from '../types';

export async function listProjects(
    config: z.input<typeof typeScriptProjectsLookupConfigSchema>
) {
    const { repositoryRoot, scope } = functionsConfigSchema.parse(config);

    const { isMonorepo, packagesGlobs } =
        await readPackagesGlobsAt(repositoryRoot);

    if (isMonorepo) {
        logger.debug(`Found monorepo packages globs`, {
            packagesGlobs,
        });
    }

    const tsconfigJsonFileName = config.tsConfigJsonFileName ?? 'tsconfig.json';

    const typescriptConfigs = await globby(
        packagesGlobs.map((p) => `${p}/${tsconfigJsonFileName}`),
        {
            cwd: repositoryRoot,
            absolute: true,
            ignore: config.ignore ?? [],
            ignoreFiles: config.ignoreFiles ?? [],
        }
    );

    if (typescriptConfigs.length === 0) {
        throw new ConfigurationError(line`
            No TypeScript projects found - cannot find any 
            ${tsconfigJsonFileName}" files in the repository
            at "${repositoryRoot}" using globs ${packagesGlobs.join(', ')}
        `);
    }

    logger.debug(`Found typescript configs`, {
        typescriptConfigs,
    });

    const unsortedPackageInfo = await Promise.all(
        typescriptConfigs.map(async (tsConfigFilePath) => ({
            tsConfigFilePath,
            directoryPath: dirname(tsConfigFilePath),
            directoryName: basename(dirname(tsConfigFilePath)),
            packageInfo: await findPackage(tsConfigFilePath),
        }))
    );

    const projects = orderBy(unsortedPackageInfo, [
        scope
            ? (p) => {
                  const index = scope.findIndex(
                      (s) =>
                          p.packageInfo?.packageJson.name.includes(s) ||
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
            No TypeScript projects found - cannot find any 
            "${tsconfigJsonFileName}" files which match ${scope?.join(', ')}
            in the repository at "${repositoryRoot}"
        `);
    }

    return projects;
}

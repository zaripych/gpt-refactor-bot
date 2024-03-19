import { join } from 'path';
import type { z } from 'zod';

import { ConfigurationError } from '../../errors/configurationError';
import type { typeScriptProjectsLookupConfigSchema } from '../types';
import { createProject } from './createProject';
import { listProjects } from './listProjects';

/**
 * Creates a ts-morph "Project" object for a given file.
 *
 * This function works by listing all projects and then looking for one that
 * is likely to contain the file. It then creates a new project and ensures the
 * file can be found in the project.
 */
export async function createProjectForFile(
    opts: {
        filePath: string;
        config: z.input<typeof typeScriptProjectsLookupConfigSchema>;
    },
    deps = {
        createProject,
        listProjects,
    }
) {
    const fullFilePath = join(opts.config.repositoryRoot, opts.filePath);
    const foundTsConfigs = await deps.listProjects(opts.config);

    const configs = foundTsConfigs.flatMap((p) =>
        fullFilePath.startsWith(p.directoryPath) ? [p] : []
    );

    if (configs.length === 0) {
        throw new ConfigurationError(
            `Could not find any ts config for file at path "${opts.filePath}"`
        );
    }

    let config = configs[0]!;
    if (configs.length > 1) {
        config = configs.reduce(
            (acc, cur) =>
                cur.directoryPath.length > acc.directoryPath.length ? cur : acc,
            config
        );
    }

    const project = deps.createProject(config);

    project.getSourceFileOrThrow(fullFilePath);

    return {
        project,
        tsConfigFilePath: config.tsConfigFilePath,
        packageInfo: config.packageInfo,
        otherProjects: foundTsConfigs.filter((p) => p !== config),
    };
}

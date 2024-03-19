import type { z } from 'zod';

import { ConfigurationError } from '../../errors/configurationError';
import { logger } from '../../logger/logger';
import { typeScriptProjectsLookupConfigSchema } from '../types';
import { createProject } from './createProject';
import { listProjects } from './listProjects';

/**
 * Creates a combined ts-morph "Project" object.
 *
 * This will find the first project and then use it as the "tsconfig.json", then
 * add source code for other projects in the first one.
 *
 * This was the original behavior of `refactor-bot` and worked for simple
 * monorepos removing the boundary between different projects and allowing the
 * user to refactor across projects. This might not work in all scenarios. For
 * example one `tsconfig.json` might have very different compiler settings than
 * the other and the code added from the other project might not be valid in the
 * first project.
 *
 * Alternative to this is to use `listProjects` and then create a `Project` for
 * each project and when the GPT model wants to execute a function, we will be
 * iterating over all the projects and executing the function in each project
 * separately.
 */
export async function createCombinedProject(
    configRaw: z.input<typeof typeScriptProjectsLookupConfigSchema>,
    deps = {
        createProject,
        listProjects,
    }
) {
    const config = typeScriptProjectsLookupConfigSchema.parse(configRaw);
    const { scope } = config;
    const projects = await listProjects(config);

    if (!projects[0]) {
        throw new ConfigurationError(
            'Cannot find any packages with tsconfig.json'
        );
    }

    logger.debug(`Using tsconfig.json as first project for combining`, {
        firstTsConfigJson: projects[0].tsConfigFilePath,
    });

    const project = deps.createProject({
        tsConfigFilePath: projects[0].tsConfigFilePath,
    });

    for (const {
        tsConfigFilePath,
        directoryName,
        packageInfo,
    } of projects.slice(1)) {
        if (
            !scope ||
            (packageInfo &&
                scope.some((s) => packageInfo.packageJson.name.includes(s))) ||
            scope.some((s) => directoryName.includes(s))
        ) {
            logger.debug(`Adding tsconfig.json at`, {
                tsConfigFilePath,
            });

            try {
                project.addSourceFilesFromTsConfig(tsConfigFilePath);
            } catch (err) {
                logger.error(`Failed to add tsconfig.json at`, {
                    tsConfigFilePath,
                    err,
                });
            }
        }
    }

    return {
        project,
        tsConfigFilePath: projects[0].tsConfigFilePath,
        packageInfo: projects[0].packageInfo,
        otherProjects: projects.slice(1),
    };
}

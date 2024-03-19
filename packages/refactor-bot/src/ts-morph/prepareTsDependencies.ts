import type { Project } from 'ts-morph';
import { z } from 'zod';

import { onceAsync } from '../utils/onceAsync';
import { createCombinedProject } from './project/createCombinedProject';
import { createProject } from './project/createProject';
import { createProjectForFile } from './project/createProjectForFile';
import { listProjects } from './project/listProjects';
import { typeScriptProjectsLookupConfigSchema } from './types';

type TsDependencies = Awaited<ReturnType<typeof prepareTsDependencies>> & {
    readonly _brand?: 'TsDependencies';
};

export const tsDependenciesSchema = z
    .function(z.tuple([]))
    .returns(z.custom<TsDependencies>());

export function prepareCachedTsDependencies(
    opts: z.input<typeof typeScriptProjectsLookupConfigSchema>
) {
    const config = typeScriptProjectsLookupConfigSchema.parse(opts);

    const projectCache = new Map<string, Project>();

    const listProjectsCached = onceAsync(async () => listProjects(config));

    const createProjectCached = (opts: { tsConfigFilePath: string }) => {
        const cachedProject = projectCache.get(opts.tsConfigFilePath);
        if (cachedProject) {
            return cachedProject;
        }

        const project = createProject({
            tsConfigFilePath: opts.tsConfigFilePath,
        });

        projectCache.set(opts.tsConfigFilePath, project);

        return project;
    };

    let combinedProject: Project | undefined;

    const dependencies = prepareTsDependencies(opts, {
        createProject: createProjectCached,
        listProjects: listProjectsCached,
    });

    return {
        ...dependencies,
        createCombinedProject: async () => {
            if (!combinedProject) {
                const project = await dependencies.createCombinedProject({
                    createProject,
                    listProjects: listProjectsCached,
                });
                combinedProject = project;
            }

            return combinedProject;
        },
    };
}

export function prepareTsDependencies(
    opts: z.input<typeof typeScriptProjectsLookupConfigSchema>,
    depsParam = {
        createProject,
        listProjects,
    }
) {
    const config = typeScriptProjectsLookupConfigSchema.parse(opts);

    return {
        createProjectForFile: async (
            opts: { filePath: string },
            deps = depsParam
        ) => {
            const { project } = await createProjectForFile(
                {
                    filePath: opts.filePath,
                    config,
                },
                deps
            );
            return project;
        },

        createCombinedProject: async (deps = depsParam) => {
            const { project } = await createCombinedProject(config, deps);
            return project;
        },

        listProjects,
        createProject,
    };
}

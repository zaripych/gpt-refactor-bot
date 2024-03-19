import { Project } from 'ts-morph';

export function createProject(config: { tsConfigFilePath: string }) {
    const project = new Project({
        tsConfigFilePath: config.tsConfigFilePath,
    });

    return project;
}

/**
 * @param {import('ts-morph').Project} project
 */
export function mapProject(project) {
    return project.getDirectories().map((dir) => dir.getPath());
}

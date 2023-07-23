import type { Project } from 'ts-morph';

export function findSourceFilePathsWhereModuleIsImported(
    project: Project,
    args: {
        module: string;
    }
) {
    const results: Set<string> = new Set();

    for (const sourceFile of project.getSourceFiles()) {
        const declarations = sourceFile.getImportDeclarations();

        for (const node of declarations) {
            // built-in imports wouldn't be relative so we can just compare:
            if (node.getModuleSpecifierValue() === args.module) {
                results.add(sourceFile.getFilePath());
                break;
            }
        }
    }

    return results;
}

import { relative } from 'path';
import type { Project } from 'ts-morph';

import type { FunctionsConfig } from '../../functions/makeFunction';

export function findSourceFilePathsWhereModuleIsImported(
    project: Project,
    config: FunctionsConfig,
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
                results.add(
                    relative(config.repositoryRoot, sourceFile.getFilePath())
                );
                break;
            }
        }
    }

    return results;
}

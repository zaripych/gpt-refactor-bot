import type { Project } from 'ts-morph';
import { SyntaxKind } from 'ts-morph';

export function mapProject(project: Project) {
    let maxDependencyCount = 0;
    let functionWithMostDependencies: {
        name: string;
        dependencies: string[];
        dependencyCount: number;
    } | null = null;

    for (const sourceFile of project.getSourceFiles()) {
        for (const func of sourceFile.getFunctions()) {
            const body = func.getBody();
            if (!body) {
                continue;
            }

            const funcStartLine = body.getStartLineNumber();
            const funcEndLine = body.getEndLineNumber();

            const paramNameSet = new Set(
                func.getParameters().map((p) => p.getName())
            );

            const identifiers = func.getDescendantsOfKind(
                SyntaxKind.Identifier
            );
            const dependencies = new Set<string>();

            for (const identifier of identifiers) {
                const identifierText = identifier.getText();

                // skip type references
                if (identifier.getParent().isKind(SyntaxKind.TypeReference)) {
                    continue;
                }

                // skip identifiers that are part of a property access expression
                if (
                    identifier
                        .getParentIfKind(SyntaxKind.PropertyAccessExpression)
                        ?.getName() === identifierText
                ) {
                    continue;
                }

                // skip identifiers without symbols
                if (!identifier.getSymbol()) {
                    continue;
                }

                // Skip if identifier is a function parameter or local declaration
                if (
                    paramNameSet.has(identifierText) ||
                    func.getVariableDeclaration(identifierText)
                ) {
                    continue;
                }

                // Get identifiers declared outside the body of the function
                // or in a different file
                const declarations = identifier
                    .getDefinitions()
                    .map((def) => def.getNode())
                    .filter(
                        (defNode) =>
                            defNode.getSourceFile() !== sourceFile ||
                            (defNode.getSourceFile() === sourceFile &&
                                (defNode.getStartLineNumber() < funcStartLine ||
                                    defNode.getStartLineNumber() > funcEndLine))
                    );

                if (declarations.length > 0) {
                    dependencies.add(identifierText);
                }
            }

            const dependencyCount = dependencies.size;
            if (dependencyCount > maxDependencyCount) {
                maxDependencyCount = dependencyCount;
                functionWithMostDependencies = {
                    name:
                        func.getName() ||
                        func.getSymbol()?.getEscapedName() ||
                        'anonymous',
                    dependencies: Array.from(dependencies),
                    dependencyCount,
                };
            }
        }
    }

    return functionWithMostDependencies;
}

export function reduce(
    results: Array<NonNullable<ReturnType<typeof mapProject>>>
) {
    // Combine all results and retrieve the function with the highest dependency count
    return results.reduce(
        (maxFunc, currFunc) => {
            if (!maxFunc) {
                return currFunc;
            }
            if (currFunc.dependencyCount > (maxFunc.dependencyCount || 0)) {
                return currFunc;
            }
            return null;
        },
        null as ReturnType<typeof mapProject>
    );
}

import { join } from 'path';
import type { ts } from 'ts-morph';
import { type Node, type Project, SyntaxKind } from 'ts-morph';

import type { FunctionsConfig } from '../../functions/makeFunction';
import { syntaxKindByIdentifierContext } from './identifierContext';
import type { Args } from './types';

export function findReferences(
    project: Project,
    config: FunctionsConfig,
    args: Args
) {
    const context: ReadonlyArray<SyntaxKind> | undefined =
        args.identifierContext
            ? syntaxKindByIdentifierContext[args.identifierContext]
            : undefined;

    const findIdentifier = (node: Node<ts.Node>) =>
        node.getKind() === SyntaxKind.Identifier &&
        node.getText() === args.identifier &&
        (!context || context.includes(node.getParentOrThrow().getKind()));

    const fullInitialFilePath = args.initialFilePath
        ? join(config.repositoryRoot, args.initialFilePath)
        : undefined;

    const sourceFile = fullInitialFilePath
        ? project.getSourceFileOrThrow(fullInitialFilePath)
        : project.getSourceFiles().find((file) => {
              const descendant = file.getFirstDescendant(findIdentifier);
              return !!descendant;
          });

    if (!sourceFile) {
        throw new Error(
            `No source files found with identifier ${args.identifier}`
        );
    }

    const node = sourceFile.getFirstDescendantOrThrow(findIdentifier, () =>
        args.initialFilePath
            ? `Cannot find identifier "${args.identifier}" in file "${args.initialFilePath}"`
            : `Cannot find identifier "${args.identifier}"`
    );

    const referencedSymbols = project.getLanguageService().findReferences(node);

    return referencedSymbols;
}

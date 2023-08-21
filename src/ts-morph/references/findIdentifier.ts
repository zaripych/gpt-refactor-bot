import { join } from 'path';
import type { ts } from 'ts-morph';
import { type Node, type Project, SyntaxKind } from 'ts-morph';

import type { FunctionsConfig } from '../../functions/makeFunction';
import { syntaxKindByIdentifierContext } from './identifierContext';
import type { Args } from './types';

export function findIdentifier(
    project: Project,
    config: FunctionsConfig,
    args: Args
) {
    const context: ReadonlyArray<SyntaxKind> | undefined =
        args.identifierContext
            ? syntaxKindByIdentifierContext[args.identifierContext]
            : undefined;

    const findIdentifierInternal = (node: Node<ts.Node>) =>
        node.getKind() === SyntaxKind.Identifier &&
        node.getText() === args.identifier &&
        (!context || context.includes(node.getParentOrThrow().getKind())) &&
        (typeof args.line !== 'number' ||
            node.getSourceFile().getLineAndColumnAtPos(node.getPos()).line ===
                args.line);

    const fullInitialFilePath = args.initialFilePath
        ? join(config.repositoryRoot, args.initialFilePath)
        : undefined;

    const sourceFile = fullInitialFilePath
        ? project.getSourceFileOrThrow(fullInitialFilePath)
        : project.getSourceFiles().find((file) => {
              const descendant = file.getFirstDescendant(
                  findIdentifierInternal
              );
              return !!descendant;
          });

    if (!sourceFile) {
        throw new Error(
            `No source files found with identifier ${args.identifier}`
        );
    }

    const node = sourceFile.getFirstDescendantOrThrow(
        findIdentifierInternal,
        () =>
            args.initialFilePath
                ? `Cannot find identifier "${args.identifier}" in file "${args.initialFilePath}"`
                : `Cannot find identifier "${args.identifier}"`
    );

    return node;
}

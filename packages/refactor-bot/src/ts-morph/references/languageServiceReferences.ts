import orderBy from 'lodash-es/orderBy';
import { join, normalize, relative } from 'path';
import type { Node, Project, ts } from 'ts-morph';
import { SyntaxKind } from 'ts-morph';

import { findPackageName } from '../../file-system/findPackageName';
import type { FunctionsConfig } from '../../functions/types';
import { firstLineOf } from '../../utils/firstLineOf';
import { syntaxKindByIdentifierContext } from './identifierContext';
import type { Args } from './types';

export async function languageServiceReferences(
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

    const results: Map<
        string,
        {
            filePath: string;
            package?: string;
            isInNodeModules: boolean;
            references: Array<{
                ancestorKind: string;
                pos: number;
                line: number;
                column: number;
                excerpt: string;
                module?: string;
            }>;
        }
    > = new Map();

    for (const reference of referencedSymbols) {
        const refs = reference.getReferences();
        for (const ref of refs) {
            const refNode = ref.getNode();
            const refSourceFile = refNode.getSourceFile();

            const filePath = normalize(
                relative(config.repositoryRoot, refSourceFile.getFilePath())
            );

            if (
                args.includeFilePaths &&
                !args.includeFilePaths.includes(filePath)
            ) {
                continue;
            }

            const lineAndCol = refSourceFile.getLineAndColumnAtPos(
                refNode.getPos()
            );

            const fileInfo = results.get(filePath) || {
                filePath,
                package: await findPackageName(refSourceFile.getFilePath()),
                isInNodeModules: refSourceFile.isInNodeModules(),
                references: [],
            };
            if (fileInfo.references.length === 0) {
                results.set(filePath, fileInfo);
            }

            const { references } = fileInfo;

            const module =
                refSourceFile.getFilePath().endsWith('.d.ts') &&
                refNode
                    .getFirstAncestorByKind(SyntaxKind.ModuleDeclaration)
                    ?.getNameNode().compilerNode.text;

            references.push({
                ancestorKind: refNode.getParentOrThrow().getKindName(),
                pos: refNode.getPos(),
                ...lineAndCol,
                excerpt: firstLineOf(
                    refNode
                        .getFirstAncestor((ancestor) =>
                            ancestor.isFirstNodeOnLine()
                        )
                        ?.getText() || refNode.getText()
                ),
                ...(module && {
                    module,
                }),
            });
        }
    }

    if (results.size === 0) {
        return results;
    }

    for (const fileInfo of results.values()) {
        fileInfo.references = orderBy(fileInfo.references, ['pos'], ['asc']);
    }

    return results;
}

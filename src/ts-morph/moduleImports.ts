import { orderBy } from 'lodash-es';
import { relative } from 'path';
import type { CallExpression, Project, ts } from 'ts-morph';
import { Node, SyntaxKind } from 'ts-morph';
import { z } from 'zod';

import { findPackageName } from '../file-system/findPackageName';
import { makeTsFunction } from '../functions/makeTsFunction';
import { markdown } from '../markdown/markdown';
import { firstLineOf } from '../utils/firstLineOf';

type Args = z.infer<typeof argsSchema>;

const argsSchema = z.object({
    module: z
        .string()
        .describe(
            'The module specifier to look for - if the module is a relative path to a source file, it should be accompanied with initialFilePath parameter for non-ambiguous results'
        ),
    initialFilePath: z
        .string()
        .describe(
            'The file path where to start looking for the module imports, since relative module specifiers with same name can point to different modules in different directories, specifying initial file path can help disambiguate between them'
        )
        .optional(),
});

const importSchema = z.object({
    pos: z
        .number()
        .describe('Absolute position of the module import in the file'),
    line: z.number().describe('Line number of the module import'),
    column: z.number().describe('Column number of the module import'),
    excerpt: z.string().describe('The line of code containing the import'),
});

type FileImports = z.infer<typeof fileImportsSchema>;

const fileImportsSchema = z.object({
    filePath: z
        .string()
        .describe('File containing module imports relative to repository root'),
    package: z
        .string()
        .describe(
            'The name of the npm package this file belongs to, could be external dependency, or package belonging to the repository'
        )
        .optional(),
    imports: z
        .array(importSchema)
        .describe(
            'List of module imports in the file, sorted by position, should not contain duplicates'
        ),
});

const resultSchema = z.array(fileImportsSchema);

function getModuleSpecifierValueFromDynamicImportStringLiteral(
    callExpression: CallExpression<ts.CallExpression>
) {
    const stringLiteral = callExpression
        .getArguments()[0]
        ?.asKindOrThrow(SyntaxKind.StringLiteral);
    return stringLiteral?.getLiteralValue();
}

function getSourceFileFromDynamicImportStringLiteral(
    callExpression: CallExpression<ts.CallExpression>
) {
    const stringLiteral = callExpression
        .getArguments()[0]
        ?.asKindOrThrow(SyntaxKind.StringLiteral);
    if (stringLiteral == null) return undefined;
    const symbol = stringLiteral.getSymbol();
    if (symbol == null) return undefined;
    const declaration = symbol.getDeclarations()[0];
    return declaration != null && Node.isSourceFile(declaration)
        ? declaration
        : undefined;
}

export async function moduleImports(
    project: Project,
    args: Args
): Promise<Array<FileImports>> {
    const findImport = (node: Node<ts.Node>) =>
        node.isKind(SyntaxKind.ImportDeclaration) &&
        node.getModuleSpecifierValue().trim() === args.module.trim();

    const initialSourceFile = args.initialFilePath
        ? project.getSourceFileOrThrow(args.initialFilePath)
        : project.getSourceFiles().find((file) => {
              const descendant = file.getFirstDescendant(findImport);
              return !!descendant;
          });

    if (!initialSourceFile) {
        if (args.initialFilePath) {
            throw new Error(`No source files found at ${args.initialFilePath}`);
        } else {
            throw new Error(`No source files found that import ${args.module}`);
        }
    }

    const firstImport = initialSourceFile
        .getFirstDescendantOrThrow(findImport, () =>
            args.initialFilePath
                ? `Cannot find import declaration importing module ${args.module} in file ${args.initialFilePath}`
                : `Cannot find import declaration importing module ${args.module}`
        )
        .asKindOrThrow(SyntaxKind.ImportDeclaration);

    const firstImportModuleSourceFile =
        firstImport.getModuleSpecifierSourceFile();

    const results: Map<
        string,
        {
            filePath: string;
            package?: string;
            isInNodeModules: boolean;
            imports: Array<{
                pos: number;
                line: number;
                column: number;
                excerpt: string;
                module?: string;
            }>;
        }
    > = new Map();

    for (const sourceFile of project.getSourceFiles()) {
        const declarations = sourceFile.getImportDeclarations();

        const dynamicImportExpressions = /import\(/g.exec(sourceFile.getText())
            ? (sourceFile
                  .getDescendantsOfKind(SyntaxKind.ImportKeyword)
                  .map((keyword) =>
                      keyword.getParent().asKind(SyntaxKind.CallExpression)
                  )
                  .filter(
                      (callExpression) =>
                          callExpression &&
                          callExpression.getArguments().length === 1 &&
                          callExpression
                              .getArguments()[0]
                              ?.isKind(SyntaxKind.StringLiteral)
                  ) as Array<CallExpression<ts.CallExpression>>)
            : [];

        const declarationNodes = declarations.map((node) => ({
            node: node as Node<ts.Node>,
            moduleSpecifier: node.getModuleSpecifierValue(),
            moduleSourceFile: node.getModuleSpecifierSourceFile(),
        }));

        const dynamicImportNodes = dynamicImportExpressions.map((node) => ({
            node: node as Node<ts.Node>,
            moduleSpecifier:
                getModuleSpecifierValueFromDynamicImportStringLiteral(node),
            moduleSourceFile: getSourceFileFromDynamicImportStringLiteral(node),
        }));

        const allNodes = dynamicImportNodes.concat(declarationNodes);

        for (const { node, moduleSpecifier, moduleSourceFile } of allNodes) {
            if (!moduleSourceFile && moduleSpecifier !== args.module) {
                continue;
            }

            if (moduleSourceFile !== firstImportModuleSourceFile) {
                continue;
            }

            const lineAndCol = sourceFile.getLineAndColumnAtPos(node.getPos());
            const filePath = relative(process.cwd(), sourceFile.getFilePath());

            const fileInfo = results.get(filePath) || {
                filePath,
                package: await findPackageName(sourceFile.getFilePath()),
                isInNodeModules: sourceFile.isInNodeModules(),
                imports: [],
            };

            if (fileInfo.imports.length === 0) {
                results.set(filePath, fileInfo);
            }

            const { imports } = fileInfo;

            imports.push({
                pos: node.getPos(),
                ...lineAndCol,
                excerpt: firstLineOf(node.getText()),
            });
        }
    }

    if (results.size === 0) {
        return [];
    }

    for (const fileInfo of results.values()) {
        fileInfo.imports = orderBy(fileInfo.imports, ['pos'], ['asc']);
    }

    return Array.from(results.values());
}

export const moduleImportsFunction = makeTsFunction({
    argsSchema,
    resultSchema,
    name: 'moduleImports',
    description: markdown`
Finds all imports of a module with specified name in the repository. This will
find both static and dynamic imports. This will work for both external packages
and packages belonging to the repository. Cases when dynamic imports do not use
literal strings are not supported.
    `,
    implementation: moduleImports,
});

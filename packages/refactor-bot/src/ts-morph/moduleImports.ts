import orderBy from 'lodash-es/orderBy';
import { join, relative } from 'path';
import type { CallExpression, Project, ts } from 'ts-morph';
import { Node, SyntaxKind } from 'ts-morph';
import { z } from 'zod';

import { findPackage } from '../file-system/findPackage';
import { makeTsFunction } from '../functions/makeTsFunction';
import type { FunctionsConfig } from '../functions/types';
import { markdown } from '../markdown/markdown';
import { firstLineOf } from '../utils/firstLineOf';
import { hasOneElement } from '../utils/hasOne';
import { getBuiltinLibs } from './builtinLibs.cjs';
import { listProjects } from './project/listProjects';

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
            'A valid file path where to start looking for the module imports. Since relative module specifiers with same name can point to different modules in different directories, specifying initial file path can help disambiguate between them.'
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

const builtIns = getBuiltinLibs();

export async function moduleImports(
    project: Project,
    config: FunctionsConfig,
    args: Args
): Promise<Array<FileImports>> {
    // listing projects to determine if the module we analyzing is an internal
    // or an external module
    const projects = await listProjects(config);

    const modules = builtIns.includes(args.module)
        ? [
              args.module.trim().replaceAll(/^node:/g, ''),
              `node:${args.module.trim().replaceAll(/^node:/g, '')}`,
          ]
        : [args.module.trim()];

    // does the module path we are searching for include the file name?
    const hasSubModulePath = args.module.includes('/');

    const moduleSpecifierIsSourceFile = project.getSourceFile(args.module);

    const moduleSpecifierIsPackagePath = projects.find(
        (project) =>
            project.packageInfo?.packageJson.name === args.module.trim()
    )?.directoryPath;

    const findImport = (node: Node<ts.Node>) => {
        const moduleSpecifier =
            node.isKind(SyntaxKind.ImportDeclaration) &&
            node.getModuleSpecifierValue().trim();

        if (!moduleSpecifier) {
            return false;
        }

        if (hasSubModulePath) {
            return (
                node.isKind(SyntaxKind.ImportDeclaration) &&
                modules.includes(moduleSpecifier)
            );
        }

        const parts = moduleSpecifier.split('/');

        if (hasOneElement(parts)) {
            return (
                modules.includes(moduleSpecifier) || modules.includes(parts[0])
            );
        }

        return modules.includes(moduleSpecifier);
    };

    const fullInitialFilePath = args.initialFilePath
        ? join(config.repositoryRoot, args.initialFilePath)
        : undefined;

    const initialSourceFile = fullInitialFilePath
        ? project.getSourceFileOrThrow(fullInitialFilePath)
        : project.getSourceFiles().find((file) => {
              const descendant = file.getFirstDescendant(findImport);
              return !!descendant;
          });

    if (!initialSourceFile && !moduleSpecifierIsSourceFile) {
        if (args.initialFilePath) {
            throw new Error(
                `No source files found at "${args.initialFilePath}"`
            );
        } else {
            throw new Error(
                `No source files found that import "${args.module}"`
            );
        }
    }

    const firstImport = initialSourceFile
        ? initialSourceFile
              .getFirstDescendantOrThrow(findImport, () =>
                  args.initialFilePath
                      ? `Cannot find import declaration importing module "${args.module}" in file "${args.initialFilePath}"`
                      : `Cannot find import declaration importing module "${args.module}"`
              )
              .asKindOrThrow(SyntaxKind.ImportDeclaration)
        : undefined;

    const lookupSourceFile = firstImport
        ? firstImport.getModuleSpecifierSourceFile()
        : moduleSpecifierIsSourceFile;

    if (!lookupSourceFile) {
        throw new Error(
            `Cannot find source file for module "${args.module}" in the repository`
        );
    }

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
            if (
                !moduleSourceFile &&
                (!moduleSpecifier || !modules.includes(moduleSpecifier))
            ) {
                continue;
            }

            if (moduleSourceFile !== lookupSourceFile) {
                continue;
            }

            const lineAndCol = sourceFile.getLineAndColumnAtPos(node.getPos());
            const filePath = relative(
                config.repositoryRoot,
                sourceFile.getFilePath()
            );

            if (moduleSpecifierIsPackagePath) {
                /**
                 * @note
                 *
                 * If the file is in the same package as the module
                 * specifier - skip it. This should ensure that when we
                 * are looking for imports of "package" where the "package"
                 * is one of the monorepo packages - we do not include
                 * itself importing its own internal files.
                 */
                if (filePath.startsWith(moduleSpecifierIsPackagePath)) {
                    continue;
                }
            }

            const fileInfo = results.get(filePath) || {
                filePath,
                package: (await findPackage(sourceFile.getFilePath()))
                    ?.packageJson.name,
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
        Finds all imports of a module with specified name in the repository.
        This will find both static and dynamic imports. And this will work for
        both external packages and packages belonging to the repository. Cases
        when dynamic imports do not use literal strings are not supported.
    `,
    implementation: moduleImports,
});

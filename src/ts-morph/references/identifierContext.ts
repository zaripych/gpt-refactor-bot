import { SyntaxKind } from 'ts-morph';
import { z } from 'zod';

export const syntaxKindByIdentifierContext = {
    function: [
        SyntaxKind.FunctionDeclaration,
        SyntaxKind.FunctionExpression,
        SyntaxKind.FunctionKeyword,
        SyntaxKind.FunctionType,
        SyntaxKind.CallExpression,
        SyntaxKind.CallSignature,
    ],
    class: [
        SyntaxKind.ClassDeclaration,
        SyntaxKind.ClassExpression,
        SyntaxKind.ClassKeyword,
        SyntaxKind.ClassStaticBlockDeclaration,
    ],
    variable: [SyntaxKind.VariableDeclaration],
    method: [
        SyntaxKind.MethodDeclaration,
        SyntaxKind.MethodSignature,
        SyntaxKind.PropertyAccessExpression,
        SyntaxKind.PropertyDeclaration,
        SyntaxKind.PropertySignature,
        SyntaxKind.CallExpression,
    ],
    property: [
        SyntaxKind.MethodDeclaration,
        SyntaxKind.MethodSignature,
        SyntaxKind.PropertyAccessExpression,
        SyntaxKind.PropertyDeclaration,
        SyntaxKind.PropertySignature,
        SyntaxKind.CallExpression,
    ],
    interface: [SyntaxKind.InterfaceDeclaration, SyntaxKind.InterfaceKeyword],
    import: [
        SyntaxKind.ImportSpecifier,
        SyntaxKind.ImportDeclaration,
        SyntaxKind.ImportClause,
        SyntaxKind.ImportEqualsDeclaration,
        SyntaxKind.ImportKeyword,
        SyntaxKind.ImportTypeAssertionContainer,
        SyntaxKind.ImportType,
    ],
    type: [
        SyntaxKind.TypeAliasDeclaration,
        SyntaxKind.TypeLiteral,
        SyntaxKind.TypeReference,
        SyntaxKind.TypeParameter,
    ],
    enum: [
        SyntaxKind.EnumDeclaration,
        SyntaxKind.EnumMember,
        SyntaxKind.EnumKeyword,
    ],
    'class-static-block': [SyntaxKind.ClassStaticBlockDeclaration],
} as const;

export const identifierContextSchema = z.enum(
    Object.keys(syntaxKindByIdentifierContext) as [
        keyof typeof syntaxKindByIdentifierContext,
        ...Array<keyof typeof syntaxKindByIdentifierContext>
    ]
);

export type IdentifierContext = z.infer<typeof identifierContextSchema>;

import type { Node, Signature, Symbol as TsSymbol, ts, Type } from 'ts-morph';
import { SymbolFlags, TypeFormatFlags } from 'ts-morph';

import { findRepositoryRoot } from '../../file-system/findRepositoryRoot';
import { prettierTypescript } from '../../prettier/prettier';
import { onceAsync } from '../../utils/onceAsync';
import { createProject } from '../createProject';
import { findReferences } from '../references/findReferences';

function intrinsicNameOf(type: Type) {
    return (type.compilerType as unknown as { intrinsicName: string })
        .intrinsicName;
}

function isPrimitive(type: Type) {
    if (type.isString()) {
        return true;
    }

    if (type.isStringLiteral()) {
        return true;
    }

    if (type.isUndefined()) {
        return true;
    }

    if (type.isNull()) {
        return true;
    }

    if (type.isUnknown()) {
        return true;
    }

    if (type.isAny()) {
        return true;
    }

    if (type.isNumber()) {
        return true;
    }

    if (type.isNumberLiteral()) {
        return true;
    }

    if (type.isBoolean()) {
        return true;
    }

    if (type.isBooleanLiteral()) {
        return true;
    }

    if (type.getSymbol()?.compilerSymbol.escapedName === 'Date') {
        return true;
    }

    if (intrinsicNameOf(type) === 'void') {
        // isVoid
        return true;
    }

    if (intrinsicNameOf(type) === 'unknown') {
        // isUnknown
        return true;
    }

    if (intrinsicNameOf(type) === 'never') {
        // isUnknown
        return true;
    }

    return false;
}

function isPromise(type: Type) {
    const symbol = type.getSymbol();

    if (!type.isObject() || !symbol) {
        return false;
    }
    const args = type.getTypeArguments();

    return symbol.getName() === 'Promise' && args.length === 1;
}

function isSimpleSignature(type: Type) {
    if (!type.isObject()) {
        return false;
    }
    const sigs = type.getCallSignatures();
    const props = type.getProperties();
    const args = type.getTypeArguments();
    const indexType = type.getNumberIndexType();
    const stringType = type.getStringIndexType();

    return (
        sigs.length === 1 &&
        props.length === 0 &&
        args.length === 0 &&
        !indexType &&
        !stringType
    );
}

type FormatFlags =
    | false // <- to be able to pass down conditional flags
    | 'remove-undefined-from-intersections';

function signature(
    sig: Signature,
    variant: 'type' | 'declaration',
    next: (type: Type, flags: FormatFlags[]) => string,
    methodName?: string
): string {
    const name = sig.getDeclaration().getSymbol()?.getName();
    const nameToUse =
        methodName ?? (['__type', '__call'].includes(name ?? '') ? '' : name);
    const params = sig.getParameters();

    return [
        variant === 'declaration' ? nameToUse : '',
        '(',
        params
            .map((param) =>
                [
                    param.getName(),
                    param.hasFlags(SymbolFlags.Optional) ? '?' : '',
                    ': ',
                    param
                        .getDeclarations()
                        .map((decl) => next(decl.getType(), []))
                        .join(','),
                ].join('')
            )
            .join(', '),
        ')',
        variant === 'declaration' ? ': ' : ' => ',
        next(sig.getReturnType(), []),
    ].join('');
}

function property(
    prop: TsSymbol,
    node: Node,
    next: (type: Type, flags: FormatFlags[]) => string
): string {
    const type = prop.getTypeAtLocation(node);
    const sigs = type.getCallSignatures();
    const firstSig = sigs[0];

    if (
        isSimpleSignature(type) &&
        !prop.hasFlags(SymbolFlags.Optional) &&
        firstSig
    ) {
        return `${signature(firstSig, 'declaration', next, prop.getName())};`;
    }
    const isOptional = prop.hasFlags(SymbolFlags.Optional);

    return [
        prop.getName(),
        isOptional ? '?' : '',
        ': ',
        next(type, [isOptional && 'remove-undefined-from-intersections']),
        ';',
    ].join('');
}

function properties(
    props: TsSymbol[],
    node: Node,
    next: (type: Type, flags: FormatFlags[]) => string
) {
    return props.map((value) => property(value, node, next)).join('\n');
}

function signatures(
    sigs: Signature[],
    variant: 'type' | 'declaration',
    next: (type: Type, flags: FormatFlags[]) => string
) {
    return sigs.map((sig) => signature(sig, variant, next)).join('\n');
}

function nodeTypeFootprintRecursive(params: {
    type: Type;
    node: Node;
    overrides?: Record<string, string>;
    flags?: FormatFlags[];
    callStackLevel?: number;
    typeNames: Map<Type, string>;
    typeFootprints: Map<Type, string>;
    visitedTypes: Set<Type>;
}): string {
    const { type, node, overrides, flags = [], callStackLevel = 0 } = params;

    if (params.visitedTypes.has(type)) {
        const typeName = () => {
            if (params.typeNames.has(type)) {
                return params.typeNames.get(type) ?? '';
            }

            params.typeNames.set(type, `Circular${params.typeNames.size}`);

            return params.typeNames.get(type) ?? '';
        };

        return typeName();
    }

    if (params.typeFootprints.has(type)) {
        return params.typeFootprints.get(type) ?? '';
    }

    if (!isPrimitive(type)) {
        params.visitedTypes.add(type);
    }

    try {
        const next = (nextType: Type, nextFlags: FormatFlags[] = []) =>
            nodeTypeFootprintRecursive({
                type: nextType,
                node,
                overrides,
                flags: nextFlags,
                callStackLevel: callStackLevel + 1,
                typeNames: params.typeNames,
                visitedTypes: params.visitedTypes,
                typeFootprints: params.typeFootprints,
            });

        const indent = (text: string, lvl = 1) =>
            text.replace(/^/gm, ' '.repeat(lvl * 2));

        const defaultFormat = () =>
            type.getText(
                node,
                TypeFormatFlags.UseSingleQuotesForStringLiteralType
            );

        const symbol = type.getAliasSymbol();

        if (overrides && symbol) {
            const result = overrides[symbol.getName()];

            if (result) {
                return result;
            }
        }

        if (isPrimitive(type)) {
            return defaultFormat();
        }

        if (callStackLevel > 9) {
            // too deep?
            return '{ /* too deep */ }';
        }

        if (type.isArray()) {
            const subType = type.getArrayElementTypeOrThrow();

            if (isPrimitive(subType)) {
                return `${next(subType)}[]`;
            }

            return `Array<\n${indent(next(subType))}\n>`;
        }

        if (type.isTuple()) {
            const types = type.getTupleElements();

            return [
                '[\n',
                indent(
                    types
                        .map((tupleElementType) => next(tupleElementType))
                        .join(',\n')
                ),
                '\n]',
            ].join('');
        }

        if (type.isObject() && isPromise(type)) {
            const first = type.getTypeArguments()[0];

            if (!first) {
                throw new Error('This should not have happened');
            }

            if (isPrimitive(first)) {
                return `Promise<${next(first)}>`;
            }

            return `Promise<\n${indent(next(first))}\n>`;
        }

        if (type.isObject() && isSimpleSignature(type)) {
            return signatures(type.getCallSignatures(), 'type', next);
        }

        if (type.isObject()) {
            const props = type.getProperties();
            const sigs = type.getCallSignatures();
            const numIndex = type.getNumberIndexType();
            const stringIndex = type.getStringIndexType();

            if (
                props.length === 0 &&
                sigs.length === 0 &&
                !numIndex &&
                !stringIndex
            ) {
                return '{}';
            }
            const sigsText = signatures(sigs, 'declaration', next);
            const propsText = properties(props, node, next);
            const numIndexText =
                numIndex && `[index: number]: ${next(numIndex)};`;
            const stringIndexText =
                stringIndex && `[index: string]: ${next(stringIndex)};`;

            return [
                '{\n',
                numIndexText && indent(numIndexText),
                stringIndexText && indent(stringIndexText),
                sigs.length > 0 && indent(sigsText),
                props.length > 0 && indent(propsText),
                '\n}',
            ]
                .filter(Boolean)
                .join('');
        }

        if (type.isUnion()) {
            return type
                .getUnionTypes()
                .filter((unionType) => {
                    if (flags.includes('remove-undefined-from-intersections')) {
                        return !unionType.isUndefined();
                    }

                    return true;
                })
                .map((unionType) => next(unionType))
                .join(' | ');
        }

        if (type.isIntersection()) {
            return type
                .getIntersectionTypes()
                .map((intersectionType) => next(intersectionType))
                .join(' & ');
        }

        return intrinsicNameOf(type);
    } finally {
        params.visitedTypes.delete(type);
    }
}

type Cache = {
    visitedTypes: Set<Type>;
    typeFootprints: Map<Type, string>;
    typeNames: Map<Type, string>;
};

const createCache = (): Cache => ({
    typeNames: new Map<Type, string>(),
    typeFootprints: new Map<Type, string>(),
    visitedTypes: new Set<Type>(),
});

export async function nodeTypeFootprint(args: {
    type: Type<ts.Type>;
    node: Node;
}) {
    const cache = createCache();
    return await prettierTypescript(
        nodeTypeFootprintRecursive({
            node: args.node,
            type: args.type,
            ...cache,
        })
    );
}

const localProject = onceAsync(async () => {
    const repositoryRoot = await findRepositoryRoot();
    return await createProject({
        repositoryRoot,
    });
});

/**
 * @todo this doesn't work well for type parameters - those
 * get serialized into empty strings
 */
export async function typeFootprint(args: {
    identifier: string;
    filePath: string;
}) {
    const { project, repositoryRoot } = await localProject();

    const initialRefs = findReferences(
        project,
        {
            repositoryRoot,
        },
        args
    );

    const result = initialRefs
        .flatMap((ref) => ref.getReferences())
        .flatMap((ref) => {
            const node = ref.getNode();
            const type = node.getType();
            return [{ type, node }];
        })
        .find(Boolean);

    if (!result) {
        throw new Error('Could not find type');
    }

    const cache = createCache();
    const text = nodeTypeFootprintRecursive({
        ...result,
        ...cache,
    });
    return await prettierTypescript(text).catch(() => text);
}

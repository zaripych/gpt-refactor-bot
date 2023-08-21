import type { Node, Project, SymbolDisplayPart, ts } from 'ts-morph';

import { prettierTypescript } from '../../prettier/prettier';

export async function quickInfoForNode(
    project: Project,
    args: {
        node: Node<ts.Node>;
    }
) {
    const { node } = args;

    const joinParts = (parts?: SymbolDisplayPart[]) =>
        parts?.map((part) => part.getText()).join('');

    const joinTsParts = (parts?: ts.SymbolDisplayPart[]) =>
        parts?.map((part) => part.text).join('');

    const quickInfo = project
        .getLanguageService()
        .compilerObject.getQuickInfoAtPosition(
            node.getSourceFile().getFilePath(),
            node.compilerNode.getStart()
        );

    const quickInfoDisplayParts = joinTsParts(quickInfo?.displayParts);

    if (quickInfoDisplayParts) {
        return await prettierTypescript(quickInfoDisplayParts).catch(
            () => quickInfoDisplayParts
        );
    }

    const initialRefs = project.getLanguageService().findReferences(node);

    const definitionParts = initialRefs
        .flatMap((ref) => joinParts(ref.getDefinition().getDisplayParts()))
        .find(Boolean);

    if (!definitionParts) {
        throw new Error(`Cannot find definition of the identifier`);
    }

    return await prettierTypescript(definitionParts).catch(
        () => definitionParts
    );
}

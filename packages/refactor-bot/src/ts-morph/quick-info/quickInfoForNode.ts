import type { Node, Project, SymbolDisplayPart, ts } from 'ts-morph';

export function quickInfoForNode(opts: {
    project: Project;
    node: Node<ts.Node>;
}) {
    const { node, project } = opts;

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
        return quickInfoDisplayParts;
    }

    const initialRefs = project.getLanguageService().findReferences(node);

    const definitionParts = initialRefs
        .flatMap((ref) => joinParts(ref.getDefinition().getDisplayParts()))
        .find(Boolean);

    if (!definitionParts) {
        throw new Error(`Cannot find definition of the identifier`);
    }

    return definitionParts;
}

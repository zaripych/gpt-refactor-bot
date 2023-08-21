import { createPatch } from 'diff';
import type { GitDiff } from 'parse-git-diff';
import parseGitDiff from 'parse-git-diff';
import { join, relative } from 'path';
import type { Project, SourceFile } from 'ts-morph';
import { SyntaxKind } from 'ts-morph';

import { createProject } from '../createProject';
import { quickInfoForNode } from './quickInfoForNode';

type IdentifierInfo = {
    identifier: string;
    context: string;
    line: number;
    content: string;
    quickInfo: string;
    declaredInFilePath?: string;
    referencedInFilePaths: string[];
};

export type IdentifierChange = {
    identifier: string;
    context: string;
    line: number;
    type: 'modified' | 'added' | 'deleted';
    content: string;
    contentDiff?: string;
    previousContent?: string;
    quickInfo: string;
    quickInfoDiff?: string;
    previousQuickInfo?: string;
    declaredInFilePath?: string;
    referencedInFilePaths: string[];
};

export async function changeInfo(opts: {
    location: string;
    oldFileContents: string;
    newFileContents: string;
    filePath: string;
    fileDiff: string;
}) {
    const { fileDiff, location, filePath, oldFileContents, newFileContents } =
        opts;
    /**
     * @note at the moment it is safer to create a new project for each request
     * even though this is a rather slow operation, we might want to optimize
     * this in the future, however, with the caching engine in place, this
     * is not a priority
     */
    const { project } = await createProject({
        repositoryRoot: opts.location,
    });
    const sourceFile = project.getSourceFileOrThrow(join(location, filePath));
    const patch = parseGitDiff(fileDiff);

    if (sourceFile.getText(true) !== oldFileContents) {
        sourceFile.replaceWithText(oldFileContents);
    }

    const oldIdentifiers = await extractIdentifiersFromPatch({
        location,
        project,
        sourceFile,
        patch,
        changeType: 'DeletedLine',
    });

    sourceFile.replaceWithText(newFileContents);

    const newIdentifiers = await extractIdentifiersFromPatch({
        location,
        project,
        sourceFile,
        patch,
        changeType: 'AddedLine',
    });

    const allChangedIdentifiers = summarizeChanges({
        newIdentifiers,
        oldIdentifiers,
    });

    const changedExports = new Map(
        Array.from(allChangedIdentifiers.values())
            .filter(
                (id) =>
                    id.declaredInFilePath === filePath &&
                    id.referencedInFilePaths.length > 0 &&
                    id.referencedInFilePaths.some((ref) => ref !== filePath)
            )
            .map((id) => [id.identifier, id] as const)
    );

    return {
        /**
         * @note although these are not technically exports
         * but just identifiers used outside the modified file, collecting
         * information on the entire set of exported identifiers could be a bit
         * too verbose and not very useful;
         *
         * calling this variable `identifiersAffectingExports` is too long
         * though;
         */
        changedExports,
        allChangedIdentifiers,
    };
}

function* iterateChanges(parsedDiff: GitDiff) {
    for (const file of parsedDiff.files) {
        for (const chunk of file.chunks) {
            switch (chunk.type) {
                case 'Chunk':
                    for (const change of chunk.changes) {
                        switch (change.type) {
                            case 'DeletedLine':
                            case 'AddedLine': {
                                yield change;
                            }
                        }
                    }
                    break;
                case 'CombinedChunk':
                    for (const change of chunk.changes) {
                        switch (change.type) {
                            case 'DeletedLine':
                            case 'AddedLine': {
                                yield change;
                            }
                        }
                    }
                    break;
                case 'BinaryFilesChunk':
                    throw new Error('Binary files not supported');
                default:
                    throw new Error('Unknown chunk type');
            }
        }
    }
}

function createPatchNoHeader(old: string, newStr: string) {
    return createPatch('', old + '\n', newStr + '\n')
        .split('\n')
        .slice(3)
        .join('\n');
}

function summarizeChanges(params: {
    newIdentifiers: Map<string, IdentifierInfo>;
    oldIdentifiers: Map<string, IdentifierInfo>;
}) {
    const { newIdentifiers, oldIdentifiers } = params;
    const changedIdentifiers: Map<string, IdentifierChange> = new Map();

    for (const [key, { quickInfo, content, ...rest }] of newIdentifiers) {
        if (!oldIdentifiers.has(key)) {
            changedIdentifiers.set(key, {
                ...rest,
                type: 'added',
                content: content,
                quickInfo: quickInfo,
            });
        } else {
            const previous = oldIdentifiers.get(key);
            changedIdentifiers.set(key, {
                ...rest,
                type: 'modified',
                content: content,
                ...(previous &&
                    previous.content !== content && {
                        previousContent: previous.content,
                        contentDiff: createPatchNoHeader(
                            previous.content,
                            content
                        ),
                    }),
                quickInfo: quickInfo,
                ...(previous &&
                    previous.quickInfo !== quickInfo && {
                        previousQuickInfo: previous.quickInfo,
                        quickInfoDiff: createPatchNoHeader(
                            previous.quickInfo,
                            quickInfo
                        ),
                    }),
            });
        }
    }

    for (const [key, { quickInfo, content, ...rest }] of oldIdentifiers) {
        if (!newIdentifiers.has(key)) {
            changedIdentifiers.set(key, {
                ...rest,
                type: 'deleted',
                content: content,
                quickInfo: quickInfo,
            });
        }
    }

    return changedIdentifiers;
}

// async function extractExportedMembersInfo(param: {
//     sourceFile: SourceFile;
//     project: Project;
// }) {
//     const { sourceFile, project } = param;
//     const foundExports = new Map<string, IdentifierInfo>();
//     const allExportedMembers = sourceFile.getExportSymbols();

//     for (const symbol of allExportedMembers) {
//         const declarations = symbol
//             .getDeclarations()
//             .filter(
//                 (declaration) => declaration.getSourceFile() === sourceFile
//             );
//         if (!hasOneElement(declarations)) {
//             continue;
//         }
//         foundExports.set(symbol.getName(), {
//             identifier: symbol.getName(),
//             content: declarations[0].getText(),
//             quickInfo: await quickInfoForNode(project, {
//                 node: declarations[0],
//             }),
//             ...sourceFile.getLineAndColumnAtPos(declarations[0].getPos()),
//         });
//     }

//     return foundExports;
// }

async function extractIdentifiersFromPatch(params: {
    location: string;
    project: Project;
    sourceFile: SourceFile;
    patch: GitDiff;
    changeType: 'AddedLine' | 'DeletedLine';
}) {
    const { project, sourceFile, patch, changeType } = params;

    const identifiers = new Map<string, IdentifierInfo>();

    const allIdentifiers = sourceFile.getDescendantsOfKind(
        SyntaxKind.Identifier
    );

    for (const change of iterateChanges(patch)) {
        if (change.type === changeType) {
            const changedLine =
                'lineBefore' in change ? change.lineBefore : change.lineAfter;
            const changedIdentifiers = allIdentifiers.filter(
                (identifier) => identifier.getStartLineNumber() === changedLine
            );

            for (const id of changedIdentifiers) {
                const definition = id.getDefinitionNodes()[0];
                identifiers.set(id.getText(), {
                    identifier: id.getText(),
                    context: id.getFirstAncestor()?.getKindName() ?? 'unknown',
                    content: change.content,
                    ...(definition && {
                        declaredInFilePath: relative(
                            params.location,
                            definition.getSourceFile().getFilePath()
                        ),
                    }),
                    referencedInFilePaths: [
                        ...new Set(
                            project
                                .getLanguageService()
                                .findReferencesAsNodes(id)
                                .map((node) =>
                                    relative(
                                        params.location,
                                        node.getSourceFile().getFilePath()
                                    )
                                )
                                .filter(
                                    (path) => !path.startsWith('node_modules')
                                )
                        ),
                    ],
                    quickInfo: await quickInfoForNode(project, { node: id }),
                    line: id.getStartLineNumber(),
                });
            }
        }
    }

    return identifiers;
}

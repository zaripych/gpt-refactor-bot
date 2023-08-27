import type { Project } from 'ts-morph';

import type { FunctionsConfig } from '../../functions/types';
import { findSourceFilePathsWhereModuleIsImported } from './findSourceFilePathsWhereModuleIsImported';
import { languageServiceReferences } from './languageServiceReferences';
import { mergeReferences } from './mergeReferences';
import type { Args, FileReferences } from './types';

export async function nodeBuiltinReferences(
    project: Project,
    config: FunctionsConfig,
    args: Args & {
        module: string;
        alreadyFoundFiles: Map<string, FileReferences>;
    }
) {
    const imports = findSourceFilePathsWhereModuleIsImported(project, config, {
        module: [
            args.module.trim().replaceAll(/^node:/g, ''),
            `node:${args.module.trim().replaceAll(/^node:/g, '')}`,
        ],
    });

    for (const foundFile of args.alreadyFoundFiles.keys()) {
        imports.delete(foundFile);
    }

    const referencesArray = await Promise.all(
        Array.from(imports).map((filePath) =>
            languageServiceReferences(project, config, {
                ...args,
                initialFilePath: filePath,
            }).catch(
                // not every file that imports our builtin is going to
                // use same identifier, so we need to ignore errors
                () =>
                    new Map() as Awaited<
                        ReturnType<typeof languageServiceReferences>
                    >
            )
        )
    );

    return mergeReferences([args.alreadyFoundFiles, ...referencesArray]);
}

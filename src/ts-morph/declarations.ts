import { relative } from 'path';
import type { Project } from 'ts-morph';
import { z } from 'zod';

import { makeTsFunction } from '../functions/makeTsFunction';
import type { FunctionsConfig } from '../functions/types';
import { markdown } from '../markdown/markdown';
import { isTruthy } from '../utils/isTruthy';
import { quickInfoForNode } from './quick-info/quickInfoForNode';
import { findIdentifier } from './references/findIdentifier';
import type { Args } from './references/types';
import { argsSchema } from './references/types';

const resultSchema = z.object({
    filePath: z
        .string()
        .describe('Path to the file containing the declaration'),
    declaration: z
        .string()
        .describe('Source code representing the declaration'),
    info: z
        .string()
        .describe('Semantic information about the specified identifier'),
});

// eslint-disable-next-line @typescript-eslint/require-await
export async function declarations(
    project: Project,
    config: FunctionsConfig,
    args: Args
): Promise<Array<z.infer<typeof resultSchema>>> {
    const node = findIdentifier(project, config, args);

    const definitions = project.getLanguageService().getDefinitions(node);

    return definitions
        .map((definition) => {
            const decl = definition.getDeclarationNode();

            if (!decl) {
                return undefined;
            }

            const declaration = decl.getFullText().trim();

            const info = quickInfoForNode(project, {
                node: decl,
                repositoryRoot: config.repositoryRoot,
            });

            return {
                filePath: relative(
                    config.repositoryRoot,
                    decl.getSourceFile().getFilePath()
                ),
                declaration,
                info,
            };
        })
        .filter(isTruthy);
}

export const declarationsFunction = makeTsFunction({
    argsSchema,
    resultSchema: z.array(resultSchema),
    name: 'declarations',
    description: markdown`
        Finds the first occurrence of an identifier with specified name in the
        repository and then returns all declarations of that identifier along
        with inferred semantic information about it.

        Identifiers are function names, variable names, class names, etc.
        Identifiers cannot have spaces in them.

        Declaration is the source code that declares the identifier. For
        example, if the identifier is the name of a function, then the
        declaration is the function signature and body.

        Semantic information is what you typically see when you hover in an
        editor. It will include the inferred information about the type of the
        identifier.

        This will find references in the entire repository, unless
        \`includeFilePaths\` is specified. Specifying this option can be very
        useful when same identifier name is used in a large number of source
        files.
    `,
    implementation: declarations,
});

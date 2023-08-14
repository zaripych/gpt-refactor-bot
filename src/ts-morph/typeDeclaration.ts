import type { SymbolDisplayPart } from 'ts-morph';
import { type Project } from 'ts-morph';
import { z } from 'zod';

import type { FunctionsConfig } from '../functions/makeFunction';
import { makeTsFunction } from '../functions/makeTsFunction';
import { markdown } from '../markdown/markdown';
import { findReferences } from './references/findReferences';

type Args = z.infer<typeof argsSchema>;

const argsSchema = z.object({
    identifier: z.string().describe('The identifier to look for'),
    initialFilePath: z
        .string()
        .describe(
            'A valid file path where to start looking for the identifier. Since identifiers can have same name in different files, specifying initial file path can help disambiguate between them.'
        ),
});

const resultSchema = z.object({
    declaration: z.string().describe('The type declaration of the identifier'),
});

type Result = z.infer<typeof resultSchema>;

export async function typeDeclaration(
    project: Project,
    config: FunctionsConfig,
    args: Args
): Promise<Result> {
    const initialRefs = findReferences(project, config, {
        ...args,
        includeFilePaths: [args.initialFilePath],
    });

    const result = initialRefs
        .slice(0)
        .flatMap((ref) => {
            const joinParts = (parts?: SymbolDisplayPart[]) =>
                parts?.map((part) => part.getText()).join('');

            return joinParts(ref.getDefinition().getDisplayParts());
        })
        .find(Boolean);

    if (!result) {
        throw new Error(`Cannot find declaration of the identifier`);
    }

    // TODO: Make this work using
    /*
    project.getLanguageService().compilerObject.getQuickInfoAtPosition
    */
    return Promise.resolve({
        declaration: result,
    });
}

export const typeDeclarationFunction = makeTsFunction({
    argsSchema,
    resultSchema,
    name: 'typeDeclaration',
    description: markdown`
Finds the specified identifier and then extracts type declaration for it.
    `,
    implementation: typeDeclaration,
});

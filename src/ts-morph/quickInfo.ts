import { type Project } from 'ts-morph';
import { z } from 'zod';

import type { FunctionsConfig } from '../functions/makeFunction';
import { makeTsFunction } from '../functions/makeTsFunction';
import { markdown } from '../markdown/markdown';
import { quickInfoForNode } from './quick-info/quickInfoForNode';
import { findIdentifier } from './references/findIdentifier';
import { identifierContextSchema } from './references/identifierContext';

type Args = z.infer<typeof argsSchema>;

const argsSchema = z.object({
    identifier: z.string().describe('The identifier to look for'),
    identifierContext: identifierContextSchema
        .describe('The context where the identifier is used')
        .optional(),
    line: z.number().optional().describe('The line number of the identifier'),
    initialFilePath: z
        .string()
        .describe(
            'A valid file path where to start looking for the identifier. Since identifiers can have same name in different files, specifying initial file path can help disambiguate between them.'
        ),
});

const resultSchema = z.object({
    info: z.string().describe('Information about the identifier'),
});

type Result = z.infer<typeof resultSchema>;

export async function quickInfo(
    project: Project,
    config: FunctionsConfig,
    args: Args
): Promise<Result> {
    const node = findIdentifier(project, config, {
        ...args,
        includeFilePaths: [args.initialFilePath],
    });

    return {
        info: await quickInfoForNode(project, { node }),
    };
}

export const quickInfoFunction = makeTsFunction({
    argsSchema,
    resultSchema,
    name: 'quickInfo',
    description: markdown`
Gets semantic information about the specified identifier. Quick info is what you typically see when you hover in an editor. This function is useful when you want to know the inferred or declared type of a variable or function.
    `,
    implementation: quickInfo,
});

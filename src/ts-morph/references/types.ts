import { z } from 'zod';

import { identifierContextSchema } from './identifierContext';

export type Args = z.infer<typeof argsSchema>;

export const argsSchema = z.object({
    identifier: z.string().describe('The identifier to look for'),
    identifierContext: identifierContextSchema
        .describe('The context where the identifier is used')
        .optional(),
    initialFilePath: z
        .string()
        .describe(
            'The file path where to start looking for the identifier, since identifiers can have same name in different files, specifying initial file path can help disambiguate between them'
        )
        .optional(),
    includeFilePaths: z
        .array(
            z
                .string()
                .describe(
                    'Files paths to include in the result, when specified the results will contain references only from these files'
                )
        )
        .optional(),
});

export type Reference = z.infer<typeof referenceSchema>;

export const referenceSchema = z.object({
    pos: z.number().describe('Absolute position of the reference in the file'),
    line: z.number().describe('Line number of the reference'),
    column: z.number().describe('Column number of the reference'),
    excerpt: z.string().describe('The line of code containing the reference'),
});

export type FileReferences = z.infer<typeof fileReferencesSchema>;

export const fileReferencesSchema = z.object({
    filePath: z
        .string()
        .describe('File containing references relative to repository root'),
    package: z
        .string()
        .describe(
            'The name of the npm package this file belongs to, could be external dependency, or package belonging to the repository'
        )
        .optional(),
    references: z
        .array(referenceSchema)
        .describe(
            'List of references in the file, sorted by position, should not contain duplicates'
        ),
});

export const resultSchema = z.array(fileReferencesSchema);

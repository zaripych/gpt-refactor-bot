import { z, ZodError } from 'zod';

import { parseJsonSchema } from '../utils/parseJsonSchema';
import { parseFencedCodeBlocks } from './parseFencedCodeBlocks';

export function parseJsonResponse<Schema extends z.ZodType<unknown>>(
    content: string,
    schema: Schema
) {
    const json = parseJsonSchema(schema);

    const fencedJson = z
        .string()
        .transform((content, ctx) => {
            try {
                const blocks = parseFencedCodeBlocks(content).filter(
                    (block) => !block.language || block.language === 'json'
                );

                if (blocks.length === 0) {
                    ctx.addIssue({
                        message: 'No fenced code blocks found of json type',
                        code: z.ZodIssueCode.custom,
                    });
                }

                return blocks.map((block) => block.code);
            } catch (err) {
                ctx.addIssue({
                    message: String(err),
                    code: z.ZodIssueCode.custom,
                });
                return z.NEVER;
            }
        })
        .pipe(z.array(json).nonempty());

    const nonFencedJson = json.transform((response) => [response] as const);

    const schemas = [nonFencedJson, fencedJson];
    const results = schemas.map((schema) => schema.safeParse(content));

    const successResult = results.find((r) => r.success);

    if (successResult && successResult.success) {
        return successResult.data[0];
    } else {
        throw new ZodError([
            ...results.flatMap((r) => (r.success ? [] : r.error.issues)),
        ]);
    }
}

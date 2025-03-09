import { z, ZodError } from 'zod';

import { parseJsonSchema } from '../utils/parseJsonSchema';
import { parseFencedCodeBlocks } from './parseFencedCodeBlocks';

export function parseJsonResponse<Schema extends z.ZodType<unknown>>(opts: {
    response: string;
    schema: Schema;
    allowMultiple: true;
}): Array<z.infer<Schema>>;
export function parseJsonResponse<Schema extends z.ZodType<unknown>>(opts: {
    response: string;
    schema: Schema;
}): z.infer<Schema>;
export function parseJsonResponse<Schema extends z.ZodType<unknown>>(opts: {
    response: string;
    schema: Schema;
    allowMultiple?: boolean;
}) {
    const { response, schema, allowMultiple = false } = opts;
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
    const results = schemas.map((schema) => schema.safeParse(response));

    const successResult = results.find((r) => r.success);

    if (successResult && successResult.success) {
        return !allowMultiple ? successResult.data[0] : successResult.data;
    } else {
        throw new ZodError([
            ...results.flatMap((r) => (r.success ? [] : r.error.issues)),
        ]);
    }
}

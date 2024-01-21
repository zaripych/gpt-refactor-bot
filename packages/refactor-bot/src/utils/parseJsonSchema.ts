import { z } from 'zod';

export function parseJsonSchema<Schema extends z.ZodType>(schema: Schema) {
    return z
        .unknown()
        .pipe(z.string())
        .transform((content: string, ctx) => {
            try {
                return JSON.parse(content) as unknown;
            } catch (err) {
                const message =
                    err instanceof Error ? err.message : String(err);
                ctx.addIssue({
                    message: `Not a valid JSON string - ${message}`,
                    code: z.ZodIssueCode.custom,
                    path: ctx.path,
                });
                return z.NEVER;
            }
        })
        .pipe(schema);
}

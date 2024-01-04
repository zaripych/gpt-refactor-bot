import type { z } from 'zod';
import { ZodError } from 'zod';

import { line } from '../text/line';
import type { SupportedZodSchemas } from './types';

export async function validateInput<Schema extends SupportedZodSchemas>(opts: {
    input: unknown;
    inputSchema: Schema;
    name: string;
}): Promise<z.output<Schema>> {
    const { input, inputSchema } = opts;

    try {
        return inputSchema.parseAsync(input) as Promise<z.output<Schema>>;
    } catch (err) {
        if (err instanceof ZodError) {
            throw new Error(
                line`
                    Initial input doesn't pass the schema validation for step
                    "${opts.name}"
                `,
                {
                    cause: err,
                }
            );
        }
        throw err;
    }
}

import { ZodError } from 'zod';

import { line } from '../text/line';
import type { SupportedZodSchemas } from './types';

export async function validateInput(opts: {
    input: unknown;
    inputSchema: SupportedZodSchemas;
    name: string;
}) {
    const { input, inputSchema } = opts;

    try {
        return inputSchema.parseAsync(input);
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

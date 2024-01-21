import type { z } from 'zod';

export function formatZodError(opts: {
    error: z.ZodError;
    heading?: string;
    footer?: string;
}) {
    const issues = opts.error.errors
        .map((error) => `- ${error.message}`)
        .join('\n');

    return [
        opts.heading || 'Parsing failed, following issues found:',
        issues,
        opts.footer,
    ]
        .filter(Boolean)
        .join('\n');
}

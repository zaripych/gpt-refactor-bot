export function formatOptional(opts: {
    text?: string;
    empty?: string;
    heading?: string;
    footer?: string;
}) {
    if (!opts.text || opts.text.length === 0) {
        return opts.empty || '';
    }

    return [opts.heading, opts.text, opts.footer].filter(Boolean).join('\n');
}

import { markdown } from '../markdown/markdown';

export function formatFencedCodeBlock(opts: {
    code: string;
    language?: string;
    marker?: '```' | '~~~';
    prettierIgnore?: boolean;
}): string;
export function formatFencedCodeBlock(opts: {
    code: string | undefined;
    language?: string;
    marker?: '```' | '~~~';
    prettierIgnore?: boolean;
}): string | undefined;
export function formatFencedCodeBlock(opts: {
    code: string | undefined;
    language?: string;
    marker?: '```' | '~~~';
    /**
     * We want to disable prettier for some code blocks to not
     * disturb the actual content (ie result of a function call)
     */
    prettierIgnore?: boolean;
}) {
    if (!opts.code) {
        return undefined;
    }

    let marker = opts.marker ?? '```';
    while (opts.code.search(marker) >= 0) {
        marker += marker[0];
    }

    const prettierIgnore = opts.prettierIgnore
        ? `<!-- prettier-ignore -->\n`
        : '';

    return markdown`
        ${prettierIgnore}${marker}${opts.language ?? ''}
        ${opts.code}
        ${marker}
    `;
}

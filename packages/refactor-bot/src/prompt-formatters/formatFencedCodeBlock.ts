import { markdown } from '../markdown/markdown';
import { escapeRegExp } from '../utils/escapeRegExp';

export function formatFencedCodeBlock(opts: {
    code: string;
    language?: string;
    marker?: '```' | '~~~';
}) {
    if (!opts.code) {
        return '';
    }

    const marker =
        opts.marker ?? opts.code.search(/^```/g) >= 0 ? '~~~' : '```';
    const candidateMarker = new RegExp(`^${escapeRegExp(marker)}`, 'g');

    if (opts.code.search(candidateMarker) >= 0) {
        throw new Error(`The code block contains the marker "${marker}"`);
    }

    return markdown`
        ${marker}${opts.language ?? ''}
        ${opts.code}
        ${marker}
    `;
}

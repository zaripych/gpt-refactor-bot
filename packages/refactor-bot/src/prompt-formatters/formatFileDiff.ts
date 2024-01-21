import { formatFencedCodeBlock } from './formatFencedCodeBlock';

export function formatFileDiff(opts: { fileDiff: string }) {
    return formatFencedCodeBlock({
        code: opts.fileDiff,
        language: 'diff',
    });
}

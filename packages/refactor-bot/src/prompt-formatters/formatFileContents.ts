import { extname } from 'path';

import { formatFencedCodeBlock } from './formatFencedCodeBlock';

export function formatFileContents(opts: {
    fileContents: string;
    language?: string;
    filePath?: string;
}) {
    let { language } = opts;

    if (!language && opts.filePath) {
        const ext = extname(opts.filePath);

        switch (ext) {
            case '.js':
                language = 'js';
                break;
            case '.ts':
                language = 'ts';
                break;
            case '.json':
                language = 'json';
                break;
            case '.md':
                language = 'markdown';
                break;
            case '.sh':
                language = 'sh';
                break;
            case '.yml':
            case '.yaml':
                language = 'yaml';
                break;
        }
    }

    return formatFencedCodeBlock({
        code: opts.fileContents,
        language,
    });
}

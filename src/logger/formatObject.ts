import { formatWithOptions } from 'util';

export const formatObject = (
    obj: object,
    opts?: {
        indent?: string;
    }
): string => {
    const entries: Array<[string, unknown]> = Object.entries(obj);

    const indent = opts?.indent ?? '    ';

    const lines = entries
        .map(([key, value], i) => {
            const formattedValue =
                typeof value === 'string'
                    ? value
                    : formatWithOptions({ colors: true }, value);
            const extraIndent = '';
            if (formattedValue.includes('\n')) {
                return [
                    indent,
                    extraIndent,
                    key,
                    ': ',
                    '↩︎\n\n',
                    indent,
                    extraIndent,
                    formattedValue.replaceAll(
                        /\n/g,
                        ['\n', indent, '', extraIndent].join('')
                    ),
                    i === entries.length - 1 ? '' : '\n',
                ]
                    .filter(Boolean)
                    .join('');
            } else {
                return [indent, extraIndent, key, ': ', formattedValue].join(
                    ''
                );
            }
        })
        .join('\n');

    return lines;
};

import assert from 'node:assert';

import { escapeRegExp } from '../utils/escapeRegExp';
import { replaceNewlinesWithSpaces } from './line';

export function format(
    text: string,
    values: Record<string, string>,
    opts?: {
        prefix?: string;
        suffix?: string;
        trimEmptyLines?: boolean;
        trimSpaces?: boolean;
        singleLine?: boolean;
    }
) {
    const prefix = opts?.prefix || '%';
    const suffix = opts?.suffix || prefix;
    const trimEmptyLines = opts?.trimEmptyLines ?? true;
    const trimSpaces = opts?.trimSpaces ?? true;

    const regexp = new RegExp(
        escapeRegExp(prefix) + '(\\w(\\w|\\d)*)' + escapeRegExp(suffix),
        'i'
    );

    let result = text;
    let element = regexp.exec(text);

    while (element) {
        assert(typeof element.index === 'number', 'element.index is undefined');

        const key = element[1];
        assert(key, `var name at ${element.index} is undefined`);

        assert(key in values, `value of ${key} is missing`);

        const value = values[key];
        assert(typeof value === 'string', `value of ${key} is not a string`);

        const before = result.substring(0, element.index);
        const after = result.substring(element.index + element[0].length);

        if (value === '' && (trimEmptyLines || trimSpaces)) {
            let beforeWhitespace = before.match(/\s*$/)?.[0] ?? '';
            let afterWhitespace = after.match(/^\s*/)?.[0] ?? '';

            if (trimEmptyLines) {
                beforeWhitespace = beforeWhitespace.replaceAll(
                    new RegExp(escapeRegExp('\n') + '+', 'g'),
                    afterWhitespace.includes('\n') ? '\n' : '\n'.repeat(2)
                );
                afterWhitespace = afterWhitespace.replaceAll(
                    new RegExp(escapeRegExp('\n') + '+', 'g'),
                    '\n'
                );
            }

            if (trimSpaces) {
                beforeWhitespace = beforeWhitespace.replaceAll(
                    new RegExp(escapeRegExp(' ') + '+', 'g'),
                    ' '
                );
                afterWhitespace = afterWhitespace.replaceAll(
                    new RegExp(escapeRegExp(' ') + '+', 'g'),
                    beforeWhitespace.length > 0 ? '' : ' '
                );

                // handle punctuation at the start of the "after" string
                if (/^\p{P}+/gu.test(after.trimStart())) {
                    beforeWhitespace = '';
                }
            }

            result =
                before.trimEnd() +
                beforeWhitespace +
                afterWhitespace +
                after.trimStart();
        } else {
            result = before + value + after;
        }

        element = regexp.exec(result);
    }

    if (opts?.singleLine ?? false) {
        return replaceNewlinesWithSpaces(result);
    } else {
        return result;
    }
}

import { line } from '../text/line';
import { escapeRegExp } from '../utils/escapeRegExp';
import { firstLineOf } from '../utils/firstLineOf';

export function* iterateFencedCodeBlocks(text: string) {
    const results: Array<{
        block: string;
        code: string;
        language?: string;
        marker: string;
        start: number;
    }> = [];

    const openingMarkerRegex =
        /^(?<openingMarker>(```*)|(~~~*))(?<language>\w+)?\n/gm;

    let openingRes = openingMarkerRegex.exec(text);
    while (openingRes) {
        const { openingMarker, language } = openingRes.groups as {
            openingMarker: string;
            language?: string;
        };

        const closingMarkerRegex = new RegExp(
            `^${escapeRegExp(openingMarker)}$`,
            'gm'
        );

        closingMarkerRegex.lastIndex = openingMarkerRegex.lastIndex;
        const closingRes = closingMarkerRegex.exec(text);

        if (!closingRes) {
            const firstLineOfCode = firstLineOf(
                text.slice(openingMarkerRegex.lastIndex)
            );
            throw new Error(
                line`
                    Could not find closing fenced code block marker
                    "${openingMarker}" for opening marker at index
                    ${openingMarkerRegex.lastIndex} which starts as
                    "${openingRes[0]}↩︎${firstLineOfCode}"
                `
            );
        }

        const code = text.slice(
            openingMarkerRegex.lastIndex,
            closingMarkerRegex.lastIndex - closingRes[0].length - 1
        );

        yield {
            code,
            block: text.slice(openingRes.index, closingMarkerRegex.lastIndex),
            ...(language && {
                language,
            }),
            marker: openingMarker,
            start: openingMarkerRegex.lastIndex - openingRes[0].length,
        };

        openingMarkerRegex.lastIndex = closingMarkerRegex.lastIndex;
        openingRes = openingMarkerRegex.exec(text);
    }

    return results;
}

export function parseFencedCodeBlocks(text: string) {
    return [...iterateFencedCodeBlocks(text)];
}

import { line } from '../text/line';
import { escapeRegExp } from '../utils/escapeRegExp';
import { firstLineOf } from '../utils/firstLineOf';

export function parseFencedCodeBlocks(text: string) {
    const results: Array<{
        code: string;
        language?: string;
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
            closingMarkerRegex.lastIndex - closingRes[0].length
        );

        results.push({
            code,
            ...(language && {
                language,
            }),
        });

        openingMarkerRegex.lastIndex = closingMarkerRegex.lastIndex;
        openingRes = openingMarkerRegex.exec(text);
    }

    return results;
}

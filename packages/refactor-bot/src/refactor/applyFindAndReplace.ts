import assert from 'assert';

import { markdown } from '../markdown/markdown';
import { formatFileContents } from '../prompt-formatters/formatFileContents';
import { format } from '../text/format';
import { line } from '../text/line';
import { ensureHasTwoElements } from '../utils/hasOne';

export const uniqueIndexOf = (opts: {
    indexOf: string;
    inText: string;
    maxOccurrences?: number;
}) => {
    const index = opts.inText.indexOf(opts.indexOf);
    if (index === -1) {
        return {
            status: 'not-found' as const,
        };
    }

    const occurrences = [index];

    let next = -1;
    do {
        const last = occurrences[occurrences.length - 1];
        assert(typeof last === 'number');

        next = opts.inText.indexOf(opts.indexOf, last + 1);

        if (next !== -1) {
            occurrences.push(next);
        }

        if (typeof opts.maxOccurrences === 'number') {
            if (occurrences.length > opts.maxOccurrences) {
                break;
            }
        }
    } while (next !== -1);

    if (occurrences.length === 1) {
        return index;
    }

    return {
        status: 'not-unique' as const,
        occurrences: ensureHasTwoElements(occurrences),
    };
};

export function applyFindAndReplace(opts: {
    text: string;
    blocks: Array<
        | {
              find: string;
              replace: string;
          }
        | {
              find: string;
              occurrence: number;
              replace: string;
          }
        | {
              findAll: string;
              replace: string;
          }
    >;
}) {
    return opts.blocks.reduce((text, block) => {
        if ('findAll' in block) {
            if (!block.findAll) {
                throw new Error(`\`"findAll"\` must not be empty`);
            }
            if (/^\s*$/.exec(block.findAll)) {
                throw new Error(`\`"findAll"\` must not be just whitespace`);
            }
            return text.replaceAll(block.findAll, block.replace);
        }

        if (!block.find) {
            throw new Error(`\`"find"\` must not be empty`);
        }
        if (/^\s*$/.exec(block.find)) {
            throw new Error(`\`"find"\` must not be just whitespace`);
        }

        const result = uniqueIndexOf({
            indexOf: block.find,
            inText: text,
        });

        if (typeof result === 'number') {
            return text.replace(block.find, block.replace);
        } else {
            if (result.status === 'not-found') {
                throw new Error(
                    format(
                        markdown`
                            Could not find the text in the file:

                            %find%
                        `,
                        {
                            find: formatFileContents({
                                fileContents: block.find,
                            }),
                        }
                    )
                );
            } else {
                const occurrences = result.occurrences;

                const occurrence = 'occurrence' in block ? block.occurrence : 0;

                if (occurrence < 0 || occurrence > occurrences.length - 1) {
                    throw new Error(
                        line`
                            The \`"occurrence"\` key must be a number
                            between 0 and ${occurrences.length - 1}.
                        `
                    );
                }

                const index = occurrences[occurrence]!;

                return (
                    text.slice(0, index) +
                    block.replace +
                    text.slice(index + block.find.length)
                );
            }
        }
    }, opts.text);
}

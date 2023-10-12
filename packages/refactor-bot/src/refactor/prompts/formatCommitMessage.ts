import { basename } from 'path';

import { lowerCamelCaseToKebabCase } from '../../utils/lowerCamelCaseToKebabCase';

export function formatCommitMessage(opts: {
    //
    type: 'refactor' | 'fix';
    filePath: string;
    message?: string;
    description?: string;
}) {
    const filePath = lowerCamelCaseToKebabCase(
        basename(opts.filePath).replaceAll(
            /\.(ts|tsx|js|jsx|mts|cjs|mjs)$/g,
            ''
        )
    );
    const message =
        opts.message ??
        (opts.type === 'refactor'
            ? 'performing code changes as per objective'
            : 'fixing linting or tsc issues');
    return [`${opts.type}(${filePath}): ${message}`, opts.description]
        .filter(Boolean)
        .join('\n\n');
}

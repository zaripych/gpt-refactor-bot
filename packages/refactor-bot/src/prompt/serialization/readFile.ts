import { extname } from 'path';

import { readFileArgsSchema } from '../../discover/readFile';
import { logger } from '../../logger/logger';

const serializeResult = (
    args: string | undefined,
    result: string,
    defaultSerialize: (
        args: string | undefined,
        result: string
    ) => {
        code: string;
        prettierIgnore?: boolean;
        language?: string;
    }
) => {
    try {
        const parsedArgs = args
            ? readFileArgsSchema.parse(JSON.parse(args))
            : undefined;
        const parsedResult = JSON.parse(result) as unknown;
        const typeByExtension: Record<string, string> = {
            '.js': 'javascript',
            '.ts': 'typescript',
            '.json': 'json',
            '.md': 'markdown',
            '.yaml': 'yaml',
            '.yml': 'yaml',
        };
        const extension = parsedArgs ? extname(parsedArgs.filePath) : '';
        const language = typeByExtension[extension];

        if (language && typeof parsedResult === 'string') {
            return {
                code: parsedResult,
                language,
                /**
                 * It's important that the actual content of the
                 * file is not changed by prettier when saving
                 * data to the .md file.
                 */
                prettierIgnore: true,
            };
        }
        return {
            code: String(parsedResult ?? result),
        };
    } catch (err) {
        logger.error('readFile', err);
        return defaultSerialize(args, result);
    }
};

const deserializeResult = (result: string) => {
    return JSON.stringify(result);
};

export const readFileResultSerializers = {
    serializeResult,
    deserializeResult,
};

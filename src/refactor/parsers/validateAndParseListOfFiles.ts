import { stat } from 'node:fs/promises';
import { join } from 'node:path';

import orderBy from 'lodash-es/orderBy';

import { isTruthy } from '../../utils/isTruthy';

export async function validateAndParseListOfFiles(opts: {
    sandboxDirectoryPath: string;
    text: string;
    sortBySize?: boolean;
}) {
    const { sandboxDirectoryPath, text } = opts;

    const filePathRegex = /^\s*\d+\.\s*[`]([^`]+)[`]\s*/gm;

    const filePaths = [
        ...new Set(
            [...text.matchAll(filePathRegex)]
                .map(([, filePath]) => filePath)
                .filter(isTruthy)
        ),
    ];

    const fileStatsOrNull = (filePath: string) =>
        stat(join(sandboxDirectoryPath, filePath)).catch(
            (error: NodeJS.ErrnoException) => {
                if (error.code === 'ENOENT') {
                    return null;
                }
                return Promise.reject(error);
            }
        );

    const filesInfos = await Promise.all(
        filePaths.map(async (filePath) => {
            const result = await fileStatsOrNull(filePath);

            return {
                filePath,
                size: result?.size,
            };
        })
    );

    const nonExistingFiles = filesInfos.filter(
        (file) => typeof file.size !== 'number'
    );

    if (nonExistingFiles.length > 0) {
        throw new Error(
            `Files at the following paths do not exist: ${nonExistingFiles
                .map(({ filePath }) => `\`${filePath}\``)
                .join(
                    ', '
                )}. Please specify file paths relative to the repository root found via the tool box.`
        );
    }

    const result = opts.sortBySize
        ? orderBy(filesInfos, ['size'], ['asc'])
        : filesInfos;

    return result.map((info) => info.filePath);
}

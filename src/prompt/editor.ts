import { readFile } from 'fs/promises';

import { spawnResult } from '../child-process/spawnResult';
import { onceAsync } from '../utils/onceAsync';

const hasCode = onceAsync(async () => {
    const result = await spawnResult('which', ['code'], {
        exitCodes: 'any',
    });
    return result.status === 0;
});

export const goToEndOfFile = async (file: string) => {
    const contents = await readFile(file, 'utf-8');

    if (await hasCode()) {
        await spawnResult(
            'code',
            ['-g', `${file}:${contents.split('\n').length}:1`],
            {
                exitCodes: 'any',
            }
        );

        return true;
    }

    return false;
};

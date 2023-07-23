import { readFile } from 'fs/promises';

import { spawnResult } from '../child-process/spawnResult';

export const goToEndOfFile = async (file: string) => {
    const contents = await readFile(file, 'utf-8');
    await spawnResult(
        'code',
        ['-g', `${file}:${contents.split('\n').length}:1`],
        {
            exitCodes: 'any',
        }
    );
};

import { readFile } from 'fs/promises';
import hash from 'object-hash';
import { join } from 'path';

import { gitStatus } from './gitStatus';

export async function changedFilesHash(opts: { location: string }) {
    const status = await gitStatus({
        location: opts.location,
    });
    const allFiles = Object.values(status).flat();

    if (allFiles.length === 0) {
        return undefined;
    }

    const contents = new Map(
        await Promise.all(
            allFiles.map((file) =>
                readFile(join(opts.location, file), 'utf-8')
                    .then((data) => [file, data] as const)
                    .catch((err: unknown) => {
                        if (
                            err &&
                            typeof err === 'object' &&
                            'code' in err &&
                            err.code === 'ENOENT'
                        ) {
                            return [file, ''] as const;
                        }
                        throw err;
                    })
            )
        )
    );

    return {
        /**
         * @note we hash over the map of files reported as changed by git, not
         * just the contents of the files, because we want to include the
         * deleted files or moved files in the hash as well.
         */
        changedFilesHash: hash(contents),
    };
}

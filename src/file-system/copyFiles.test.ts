import { expect, it, jest } from '@jest/globals';
import { access, readlink, symlink, writeFile } from 'fs/promises';
import { mkdir } from 'fs/promises';
import { globby } from 'globby';
import { tmpdir } from 'os';
import { join, normalize } from 'path';

import { spawnResult } from '../child-process/spawnResult';
import { randomText } from '../utils/randomText';
import { copyFiles } from './copyFiles';
import { emptyDir } from './emptyDir';

jest.setTimeout(10_000);

const listDirsDifferenceUsingGlobby = async (
    source: string,
    target: string
) => {
    const [sourceEntries, targetEntries] = await Promise.all([
        globby(['**/*', '*'], {
            cwd: source,
            dot: true,
            onlyFiles: false,
            followSymbolicLinks: false,
        }),
        globby(['**/*', '*'], {
            cwd: target,
            dot: true,
            onlyFiles: false,
            followSymbolicLinks: false,
        }),
    ]);

    const sourceSet = new Set(sourceEntries);

    const targetSet = new Set(targetEntries);

    return [...sourceSet.values()].filter((source) => !targetSet.has(source));
};

const listDirsDifferenceUsingRSync = async (source: string, target: string) => {
    const { stdout, error } = await spawnResult(
        'rsync',
        [
            '-avnc',
            source + '/',
            target,
            '--no-group',
            '--no-owner',
            '--no-perms',
            '--no-times',
            /**
             * @note rsync actually will not do anything about absolute
             * symlinks that point outside destDir but we do, we keep
             * them as absolute symlinks, but recreate them to point
             * within the copied directory tree - this only works for links
             * that point within the copied directory tree
             */
            '--safe-links',
        ],
        {
            cwd: source,
            output: ['stdout'],
            exitCodes: [0],
        }
    );
    if (error) {
        throw error;
    }
    return findRsyncComparePaths(stdout);
};

const listDirsDifference = async (source: string, target: string) => {
    if (process.platform === 'win32') {
        return listDirsDifferenceUsingGlobby(source, target);
    } else {
        return listDirsDifferenceUsingRSync(source, target);
    }
};

const checkExists = async (filePath: string): Promise<boolean> => {
    try {
        await access(filePath);
        return true;
    } catch {
        return false;
    }
};

// const copyUsingRsync = async (source: string, target: string) => {
//     await spawnResult(
//         'rsync',
//         [
//             '-ac',
//             './',
//             target,
//             '--no-group',
//             '--no-owner',
//             '--no-perms',
//             '--no-times',
//         ],
//         {
//             cwd: source,
//             output: [],
//             exitCodes: [0],
//         }
//     );
// };

const createTestContent = async (location: string) => {
    await mkdir(location, { recursive: true });
    await mkdir(join(location, 'src'), { recursive: true });
    await mkdir(join(location, 'src', 'node_modules'), { recursive: true });
    await mkdir(join(location, 'src', 'node_modules', 'package1'), {
        recursive: true,
    });
    await mkdir(join(location, 'src', 'node_modules', 'package2'), {
        recursive: true,
    });
    await mkdir(join(location, 'src', 'utils'), { recursive: true });
    await writeFile(
        join(location, 'src', 'utils', 'helper.ts'),
        randomText(256)
    );
    await writeFile(join(location, 'src', 'main.ts'), randomText(256));
    await writeFile(join(location, 'src', 'file1.ts'), randomText(256));
    await writeFile(join(location, 'src', 'file2.ts'), randomText(256));
    await writeFile(join(location, 'src', 'file2.ts'), randomText(256));
    await symlink(
        join(location, 'src', 'file2.ts'),
        join(location, 'src', 'file2-absolute-link.ts')
    );
    await symlink('./file1.ts', join(location, 'src', 'file1-rel-link.ts'));
    await symlink(
        './file-broken.ts',
        join(location, 'src', 'file-broken-link.ts')
    );
    await writeFile(join(location, '.env'), randomText(256));
};

const verifyTestContent = async (destDir: string) => {
    expect(await checkExists(join(destDir, 'src'))).toBe(true);
    expect(await checkExists(join(destDir, 'src', 'main.ts'))).toBe(true);
    expect(await checkExists(join(destDir, 'src', 'file1.ts'))).toBe(true);
    expect(await checkExists(join(destDir, 'src', 'file2.ts'))).toBe(true);
    expect(
        await checkExists(join(destDir, 'src', 'file2-absolute-link.ts'))
    ).toBe(true);
    expect(await checkExists(join(destDir, 'src', 'file1-rel-link.ts'))).toBe(
        true
    );
    expect(await checkExists(join(destDir, '.env'))).toBe(true);
    expect(await checkExists(join(destDir, 'src', 'utils', 'helper.ts'))).toBe(
        true
    );
    expect(await checkExists(join(destDir, 'src', 'node_modules'))).toBe(true);

    expect(
        normalize(
            await readlink(join(destDir, 'src', 'file1-rel-link.ts')).catch(
                () => ''
            )
        )
    ).toBe(normalize('./file1.ts'));

    /**
     * @note rsync actually will not do anything about absolute link
     * unless we remove --safe-links parameter
     */
    expect(
        await readlink(join(destDir, 'src', 'file2-absolute-link.ts')).catch(
            () => ''
        )
    ).toBe(join(destDir, 'src', './file2.ts'));

    expect(
        normalize(
            await readlink(join(destDir, 'src', 'file-broken-link.ts')).catch(
                () => ''
            )
        )
    ).toBe(normalize('./file-broken.ts'));
};

it('copies files, directories and various kinds of symlinks', async () => {
    const temporarySource = join(
        tmpdir(),
        'copy-files-test',
        'source-YmVuyA6l'
    );
    const temporaryDestination = join(
        tmpdir(),
        'copy-files-test',
        'dest-Vn6w5T9e'
    );

    await emptyDir(temporarySource);
    await emptyDir(temporaryDestination);
    await createTestContent(temporarySource);

    await copyFiles({
        source: temporarySource,
        destination: temporaryDestination,
        include: ['**/*', '*'],
        options: {
            dot: true,
        },
    });

    expect(
        await listDirsDifference(temporarySource, temporaryDestination)
    ).toEqual([]);

    await verifyTestContent(temporaryDestination);

    await copyFiles({
        source: temporarySource,
        destination: temporaryDestination,
        include: ['**/*', '*'],
        existsError: 'overwrite',
        options: {
            dot: true,
        },
    });
});

it('ignores .env when requested', async () => {
    const temporarySource = join(
        tmpdir(),
        'copy-files-test',
        'source-lSUU8uR1'
    );
    const temporaryDestination = join(
        tmpdir(),
        'copy-files-test',
        'dest-qdxeGBi5'
    );

    await emptyDir(temporarySource);
    await emptyDir(temporaryDestination);

    await createTestContent(temporarySource);

    await copyFiles({
        source: temporarySource,
        destination: temporaryDestination,
        include: ['**/*', '*'],
        options: {
            dot: true,
            ignore: ['.env'],
        },
    });

    expect(
        await listDirsDifference(temporarySource, temporaryDestination)
    ).toEqual(['.env']);
});

const findRsyncComparePaths = (text: string) => {
    const start = text.indexOf('building file list ... done');
    const end = text.indexOf('sent');
    return (
        text
            .substring(start, end)
            .trim()
            .split('\n')
            /**
             * @note rsync actually will not do anything about absolute
             * symlinks that point outside destDir **but we do**, we keep
             * them as absolute symlinks, but recreate them to point
             * within the copied directory tree - this only works for links
             * that point within the copied directory tree
             */
            .filter((line) => !line.startsWith('ignoring unsafe symlink'))
            .map((line) => line.trim())
            .slice(1)
    );
};

it('we know how to extract paths from rsync output', () => {
    expect(
        findRsyncComparePaths(
            `building file list ... done
src/utils/handleExceptions.ts
src/utils/hasOne.ts
ignoring unsafe symlink "src/utils/hasOne.ts" -> "/Users/dude/projects/"
  
sent 2219334 bytes  received 251324 bytes  705902.29 bytes/sec
total size is 537780331  speedup is 217.67
  `
        )
    ).toEqual(['src/utils/handleExceptions.ts', 'src/utils/hasOne.ts']);
});

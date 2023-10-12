import type { Stats } from 'node:fs';
import {
    copyFile,
    mkdir,
    readlink,
    realpath,
    stat,
    symlink,
    unlink,
} from 'node:fs/promises';
import {
    dirname,
    isAbsolute,
    join,
    normalize,
    relative,
    resolve,
} from 'node:path';

import type { Options } from 'globby';
import { globbyStream } from 'globby';

import { logger } from '../logger/logger';

export type CopyOptsExtra = Pick<
    Options,
    'cwd' | 'deep' | 'dot' | 'onlyDirectories' | 'ignore' | 'ignoreFiles'
>;

export type CopyGlobOpts = {
    /**
     * Source directory
     */
    source?: string;
    /**
     * One or more patterns inside directory.
     *
     * NOTE: the directory structure of the matched files/directories is going to be retained
     * relative to the source directory
     */
    include: string[];
    exclude?: string[];
    destination: string;
    accessError?: 'ignore' | 'throw' | 'overwrite';
    existsError?: 'ignore' | 'throw' | 'overwrite';
    options?: CopyOptsExtra & {
        dryRun?: boolean;
        verbose?: boolean;
    };
};

export type CopyOpts = CopyGlobOpts;

type Entry = {
    path: string;
    stats: Stats;
};

function entriesFromGlobs({
    source,
    exclude,
    include,
    options,
}: Pick<CopyGlobOpts, 'source' | 'include' | 'exclude' | 'options'>) {
    const entries = globbyStream(
        [...(exclude ? exclude.map((glob) => `!${glob}`) : []), ...include],
        {
            followSymbolicLinks: false,
            ...options,
            onlyFiles: false,
            stats: true,
            objectMode: true,
            cwd: source,
            absolute: true,
        }
    );
    return entries as AsyncIterable<Entry>;
}

function getDeps(opts: CopyOpts) {
    const rethrowToCaptureStackTrace = (err: NodeJS.ErrnoException) => {
        throw Object.assign(new Error(err.message, { cause: err }), {
            code: err.code,
            path: err.path,
            errno: err.errno,
            syscall: err.syscall,
        });
    };
    const normalDeps = {
        stat,
        realpath,
        readlink,
        mkdir,
        symlink,
        copyFile,
        unlink,
    };
    const dryRunDeps = {
        stat,
        realpath,
        readlink,
        mkdir: () => {
            return Promise.resolve();
        },
        symlink: () => {
            return Promise.resolve();
        },
        copyFile: () => {
            return Promise.resolve();
        },
        unlink: () => {
            return Promise.resolve();
        },
    };
    const nonVerboseDeps = opts.options?.dryRun ? dryRunDeps : normalDeps;
    const verboseDeps = Object.fromEntries(
        Object.entries(nonVerboseDeps).map(([key, value]) => [
            key,
            async (...args: unknown[]) => {
                let result: unknown;
                try {
                    result = await (value as (...args: unknown[]) => unknown)(
                        ...args
                    );
                    return result;
                } finally {
                    if (typeof result !== 'undefined') {
                        logger.silly(key, ...args, '->', result);
                    } else {
                        logger.silly(key, ...args);
                    }
                }
            },
        ])
    );
    const deps = opts.options?.verbose ? verboseDeps : nonVerboseDeps;
    return Object.fromEntries(
        Object.entries(deps).map(
            ([key, fn]: [string, (...args: unknown[]) => Promise<unknown>]) => [
                key,
                (...args: unknown[]) =>
                    fn(...args).catch(rethrowToCaptureStackTrace),
            ]
        )
    ) as typeof normalDeps;
}

/**
 * Primary reasoning behind custom implementation of copying files is that
 * we need to be able to ignore things via .gitignore and glob patterns. We
 * need this for better security as we don't want to copy ignored files around.
 *
 * We also want copying to work fine even if the target directory
 * or files already exist. (Ie refactoring using same sandbox multiple times)
 *
 * From performance perspective, this is faster than rsync for empty target,
 * but slower for non-empty target.
 *
 * This is also faster than `copy` from `fs-extra`.
 */
export async function copyFiles(opts: CopyOpts) {
    const deps = getDeps(opts);

    const createdDirs = new Set<string>();
    const symlinkEntries: Array<Entry> = [];
    const source = resolve(opts.source || '.');

    for await (const entry of entriesFromGlobs(opts)) {
        if (opts.options?.dryRun) {
            logger.silly('found entry', entry);
        }

        const { stats } = entry;
        const sourcePath = normalize(entry.path);
        const targetPath = join(opts.destination, relative(source, sourcePath));

        if (stats.isSymbolicLink()) {
            // skip symbolic links for now as they might be pointing to the
            // files in the directory tree being copied, this allows us to
            // create identical symbolic links later
            symlinkEntries.push(entry);
        } else if (stats.isFile()) {
            const targetDirectory = dirname(targetPath);
            if (!stats.isDirectory() && !createdDirs.has(targetDirectory)) {
                await deps.mkdir(targetDirectory, {
                    recursive: true,
                });
                createdDirs.add(targetDirectory);
            }
            await deps
                .copyFile(sourcePath, targetPath)
                .catch(async (err: NodeJS.ErrnoException) => {
                    const handle = async (
                        handleCase: 'throw' | 'ignore' | 'overwrite' = 'throw'
                    ) => {
                        if (handleCase === 'overwrite') {
                            await deps.unlink(targetPath);
                            await deps.copyFile(sourcePath, targetPath);
                            return Promise.resolve();
                        } else if (handleCase === 'ignore') {
                            return Promise.resolve();
                        } else {
                            return Promise.reject(err);
                        }
                    };

                    if (err.code === 'EACCES' || err.code === 'EPERM') {
                        return handle(opts.accessError);
                    }

                    if (err.code === 'EEXIST') {
                        return handle(opts.existsError);
                    }

                    return Promise.reject(err);
                });
        } else if (stats.isDirectory()) {
            await deps.mkdir(targetPath, {
                recursive: true,
            });
            createdDirs.add(targetPath);
        } else {
            // ignore
        }
    }

    const realSource = await deps.realpath(source);
    for (const entry of symlinkEntries) {
        const sourcePath = normalize(entry.path);
        const linkPath = join(opts.destination, relative(source, sourcePath));

        const link = await deps.readlink(sourcePath);

        const realLinkTarget = await deps
            .realpath(sourcePath)
            .catch((err: NodeJS.ErrnoException) => {
                if (err.code === 'ENOENT') {
                    // broken link
                    return Promise.resolve(null);
                } else {
                    return Promise.reject(err);
                }
            });

        const realLinkStats =
            process.platform === 'win32' && realLinkTarget
                ? await deps.stat(realLinkTarget)
                : undefined;

        const symlinkType = (stats: Stats) =>
            stats.isDirectory() ? 'dir' : 'file';

        const linkTargetIsWithinSourceDir = realLinkTarget
            ? realLinkTarget.startsWith(realSource)
            : sourcePath.startsWith(source);

        const isExistingLinkDifferent = async () => {
            const existingLink = await readlink(linkPath);
            if (isAbsolute(existingLink) && isAbsolute(link)) {
                if (
                    relative(opts.destination, existingLink) !==
                    relative(realSource, link)
                ) {
                    return true;
                }
            } else if (normalize(existingLink) !== normalize(link)) {
                return true;
            }

            return false;
        };

        const targetWithinDest = isAbsolute(link)
            ? join(opts.destination, relative(source, link))
            : link;

        const target = linkTargetIsWithinSourceDir
            ? targetWithinDest
            : // no way but to create a symlink to the target
              // outside destination or try to create the broken link
              realLinkTarget || sourcePath;

        await deps
            .symlink(
                target,
                linkPath,
                realLinkStats ? symlinkType(realLinkStats) : undefined
            )
            .catch(async (err: NodeJS.ErrnoException) => {
                const handle = async (
                    handleCase: 'throw' | 'ignore' | 'overwrite' = 'throw'
                ) => {
                    if (handleCase === 'overwrite') {
                        await deps.unlink(linkPath);
                        await deps.symlink(
                            target,
                            linkPath,
                            realLinkStats
                                ? symlinkType(realLinkStats)
                                : undefined
                        );
                        return Promise.resolve();
                    } else if (handleCase === 'ignore') {
                        return Promise.resolve();
                    } else {
                        return Promise.reject(err);
                    }
                };

                if (
                    err.code === 'EEXIST' &&
                    (await isExistingLinkDifferent())
                ) {
                    return handle(opts.existsError);
                }
            });
    }
}

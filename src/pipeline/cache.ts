import { basename, join, relative } from 'path';
import { ZodError } from 'zod';

import { ancestorDirectories } from '../utils/ancestorDirectories';
import { hasOneElement } from '../utils/hasOne';
import { defaultDeps } from './dependencies';
import { loadResult, saveResult } from './persistence';
import { getPipelineState, type PipelineState } from './state';
import type { SupportedZodSchemas } from './types';

export async function lookupResultInCache(opts: {
    key: string;
    name: string;
    resultSchema: SupportedZodSchemas;
    location?: string;
    state: PipelineState;
}) {
    if (!opts.location) {
        return undefined;
    }

    if (
        opts.state.enableCacheFor &&
        !opts.state.enableCacheFor.includes(opts.name)
    ) {
        return;
    }

    const foundResult = opts.state.results.get(opts.key);
    if (foundResult) {
        return foundResult;
    }

    try {
        /**
         * @note to simplify mocking there is only fg dependency, but
         * what we really needed here is fs.stats, but let's use the fg
         * so we don't have to mock fs.stats and sync it with the fg.
         */
        const entries = await opts.state.deps.fg(
            [`${basename(opts.key)}.yaml`],
            {
                cwd: opts.location,
                ignore: [],
            }
        );

        if (!hasOneElement(entries)) {
            return undefined;
        }

        return await loadResult(
            {
                location: join(opts.location, entries[0]),
                schema: opts.resultSchema,
            },
            opts.state.deps
        );
    } catch (err) {
        if (err instanceof ZodError) {
            return undefined;
        } else if (
            typeof err === 'object' &&
            err &&
            'code' in err &&
            err.code === 'ENOENT'
        ) {
            return undefined;
        } else {
            throw err;
        }
    }
}

export async function saveResultToCache(opts: {
    key: string;
    result: unknown;
    resultSchema: SupportedZodSchemas;
    location?: string;
    state: PipelineState;
}) {
    opts.state.results.set(opts.key, opts.result);

    if (opts.state.saveResult && opts.location) {
        await saveResult(
            {
                location: `${opts.key}.yaml`,
                result: opts.result,
                resultSchema: opts.resultSchema,
            },
            opts.state.deps
        );
    }
}

export async function cleanCache(
    stateRef: { location?: string },
    deps = defaultDeps
) {
    const state = getPipelineState(stateRef);
    if (!state) {
        return;
    }

    const { location } = stateRef;
    const { log } = state;
    const { logger, unlink, rm, fg } = {
        ...state.deps,
        ...deps,
    };

    if (!state.saveResult) {
        return;
    }

    if (!location) {
        return;
    }

    if (state.isAborted) {
        return;
    }

    logger.trace('Cleaning', relative(process.cwd(), location));

    /**
     * Filter out any directory or file that appears in the log
     */
    const ignore = [
        ...new Set(
            log.flatMap((entry) => {
                const entryPattern = relative(
                    location,
                    entry.replaceAll(/\.yaml/g, '') + '*'
                );
                return [
                    entryPattern,
                    ...ancestorDirectories(entryPattern).map(
                        (dir) => dir + '*'
                    ),
                ];
            })
        ),
    ];

    const filesAndDirs = await fg([`*.yaml`, `*`], {
        cwd: location,
        ignore,
        onlyFiles: false,
    });

    for (const entry of filesAndDirs) {
        logger.trace(
            `Deleting`,
            relative(process.cwd(), join(location, entry))
        );

        if (entry.endsWith('.yaml')) {
            await unlink(join(location, entry));
        } else {
            const toDelete = join(location, entry);

            /**
             * @note ensure we do not delete anything outside of the
             * cache directory - our cache directories have .yaml files
             * in them and nothing else. Also our cache directories cannot
             * be empty, so just ignore empty directories.
             */
            const contents = await fg(['*'], {
                cwd: toDelete,
                onlyFiles: false,
                ignore: [],
            });

            if (!contents.every((file) => file.endsWith('.yaml'))) {
                throw new Error(
                    'Found a non-yaml file in the cache, aborting cleanup'
                );
            }

            if (contents.length > 0) {
                await rm(toDelete, { recursive: true });
            }
        }
    }
}

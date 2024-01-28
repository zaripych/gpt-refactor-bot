import { basename, dirname, join, relative, sep } from 'path';
import posix from 'path/posix';
import type { z } from 'zod';
import { ZodError } from 'zod';

import type { AnyAction } from '../event-bus';
import { ancestorDirectories } from '../utils/ancestorDirectories';
import { hasOneElement } from '../utils/hasOne';
import { defaultDeps } from './dependencies';
import { loadEvents, saveEvents } from './persistence';
import { shouldDisableCache } from './shouldDisableCache';
import { type CacheState, getPipelineState } from './state';

export function explainCacheKey(key?: string) {
    const onlySteps = key?.split('/state/')[1];
    const steps = onlySteps?.split(sep);
    return steps?.flatMap((step) => {
        const result = step.replaceAll(/^\./g, '').split('-');
        if (result.length > 1) {
            return [
                {
                    name: result.slice(0, result.length - 1).join('-'),
                    hash: result[result.length - 1],
                },
            ];
        }
        return [];
    });
}

export async function lookupEventsInCache<
    EventsSchemas extends
        | z.ZodArray<z.ZodType<unknown>>
        | z.ZodEffects<z.ZodArray<z.ZodType<unknown>>>,
>(opts: {
    location?: string;
    key: string;
    name: string;
    state: CacheState;
    eventsSchema: EventsSchemas;
}): Promise<
    | {
          foundLocation: undefined;
          foundEvents: undefined;
      }
    | {
          foundLocation?: string;
          foundEvents: AnyAction[];
      }
> {
    if (!opts.location) {
        return {
            foundLocation: undefined,
            foundEvents: undefined,
        };
    }

    if (
        shouldDisableCache({
            name: opts.name,
            key: opts.key,
            enableCacheFor: opts.state.enableCacheFor,
            disableCacheFor: opts.state.disableCacheFor,
        })
    ) {
        opts.state.deps.logger.trace('Cache disabled by user request', {
            name: opts.name,
            key: opts.key,
            enableCacheFor: opts.state.enableCacheFor,
            disableCacheFor: opts.state.disableCacheFor,
        });

        return {
            foundLocation: undefined,
            foundEvents: undefined,
        };
    }

    const foundEvents = opts.state.events.get(opts.key);
    if (foundEvents) {
        return {
            foundLocation: undefined,
            foundEvents,
        };
    }

    try {
        const cwd = opts.state.internal_unboundCacheLookup
            ? opts.state.location ?? opts.location
            : opts.location;
        /**
         * @note to simplify mocking there is only fg dependency, but
         * what we really needed here is fs.stats, but let's use the fg
         * so we don't have to mock fs.stats and sync it with the fg.
         */
        const entries = await opts.state.deps.fg(
            opts.state.internal_unboundCacheLookup
                ? [
                      `${basename(opts.key)}.yaml`,
                      `**/${basename(opts.key)}.yaml`,
                  ]
                : [`${basename(opts.key)}.yaml`],
            {
                cwd,
                ignore: [],
            }
        );

        if (!hasOneElement(entries)) {
            return {
                foundLocation: undefined,
                foundEvents: undefined,
            };
        }

        return {
            foundLocation: join(cwd, entries[0]),
            foundEvents: (await loadEvents(
                {
                    location: join(cwd, entries[0]),
                    eventsSchema: opts.eventsSchema,
                },
                opts.state.deps
            )) as AnyAction[],
        };
    } catch (err) {
        if (err instanceof ZodError) {
            return {
                foundLocation: undefined,
                foundEvents: undefined,
            };
        } else if (
            typeof err === 'object' &&
            err &&
            'code' in err &&
            err.code === 'ENOENT'
        ) {
            return {
                foundLocation: undefined,
                foundEvents: undefined,
            };
        } else {
            throw err;
        }
    }
}

export async function saveEventsToCache<
    EventsSchemas extends
        | z.ZodArray<z.ZodType<unknown>>
        | z.ZodEffects<z.ZodArray<z.ZodType<unknown>>>,
>(opts: {
    key: string;
    events: AnyAction[];
    eventsSchema: EventsSchemas;
    location?: string;
    state: CacheState;
}) {
    opts.state.events.set(opts.key, opts.events);

    if (!opts.state.saveToCache) {
        return;
    }

    if (opts.location) {
        await saveEvents(
            {
                location: `${opts.key}.yaml`,
                events: opts.events,
                eventsSchema: opts.eventsSchema,
            },
            opts.state.deps
        );
    }
}

export async function cleanCache(
    opts: {
        cleanRoot?: boolean;
    },
    ctx: { location?: string },
    deps = defaultDeps
) {
    const state = getPipelineState(ctx);
    if (!state) {
        return;
    }

    const { location } = ctx;
    const { log } = state;
    const { logger, unlink, rm, fg } = {
        ...state.deps,
        ...deps,
    };

    if (!state.saveToCache) {
        return;
    }

    if (!location) {
        return;
    }

    if (state.isAborted) {
        return;
    }

    logger.trace('Cleaning', {
        location,
    });

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
                    posix.normalize(entryPattern),
                    ...ancestorDirectories(entryPattern).map((dir) =>
                        posix.normalize(dir + '*')
                    ),
                ];
            })
        ),
    ];

    const include = [
        ...new Set(
            log.flatMap((entry) => {
                const parent = dirname(relative(location, entry));
                if (parent === '.' || parent === './' || parent === '.\\') {
                    return [];
                } else {
                    return [posix.join(parent, '*')];
                }
            })
        ),
    ];

    const filesAndDirs = await fg(
        [...(opts.cleanRoot ? [`*.yaml`, `*`] : []), ...include],
        {
            cwd: location,
            ignore,
            onlyFiles: false,
        }
    );

    for (const entry of filesAndDirs) {
        logger.trace(`Deleting`, join(location, entry));

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
            const contents = await fg(['**/*', '*'], {
                cwd: toDelete,
                onlyFiles: true,
                ignore: [],
            });

            if (!contents.every((file) => file.endsWith('.yaml'))) {
                throw new Error(
                    `Found a non-yaml file in the cache, aborting cleanup: ${contents.join(
                        ', '
                    )}`
                );
            }

            if (contents.length > 0) {
                await rm(toDelete, { recursive: true });
            }
        }
    }
}

import { AsyncLocalStorage } from 'async_hooks';
import { relative } from 'path';

import type { AnyAction } from '../event-bus';
import { line } from '../text/line';
import { abortPipeline } from './abort';
import { cleanCache } from './cache';
import { defaultDeps } from './dependencies';
import { logExecutionLog } from './log';
import type { CacheStateRef } from './types';

/**
 * Internal state of the pipeline
 * @internal
 */
export type CacheState = {
    readonly location?: string;

    /**
     * All events from all cached observables are stored here, the
     * key is determined by the function name and the input hash as
     * well as the key of the parent function.
     */
    readonly events: Map<string, AnyAction[]>;

    /**
     * Flat log of all executed pipeline functions, this is used to
     * detect cycles in the pipeline.
     */
    readonly log: string[];

    /**
     * Whether to save the results of the pipeline to the cache or not, this
     * allows disabling modifications to the cache to ensure currently cached
     * data is not overwritten.
     *
     * So if we hit the cache - we use it, but we don't save it back if we don't
     * get the hit.
     */
    readonly saveToCache: boolean;

    /**
     * Whether to load the cache for the given function or not, this allows us
     * to disable the cache for certain functions only for debugging and testing
     * purposes.
     */
    readonly enableCacheFor?: string[];

    /**
     * If set to `true` the pipeline will stop executing and throw
     * an error.
     */
    isAborted?: boolean;

    readonly deps: typeof defaultDeps;
};

export const pipelineState = Symbol('pipelineState');

/**
 * @internal
 */
export const initializeCacheState = (
    ctx?: CacheStateRef & {
        saveToCache?: boolean;
        saveInput?: boolean;
        enableCacheFor?: string[];
    },
    depsRaw: Partial<typeof defaultDeps> = defaultDeps
) => {
    const deps = {
        ...defaultDeps,
        ...depsRaw,
    };
    const { logger } = deps;

    const withSymbol = ctx as
        | (typeof ctx & {
              [pipelineState]: CacheState | undefined;
          })
        | undefined;

    let state = withSymbol?.[pipelineState];

    if (!state) {
        const location = relative(process.cwd(), ctx?.location || '.');

        if (location) {
            logger.debug('Initializing new pipeline state', {
                location,
            });
        } else {
            logger.debug(
                line`
                    Initializing new pipeline state, saving cache to disk
                    is disabled
                `
            );
        }

        state = {
            location: ctx?.location,
            events: new Map<string, AnyAction[]>(),
            log: [],
            saveToCache: ctx?.saveToCache ?? true,
            enableCacheFor: ctx?.enableCacheFor,
            deps,
        };
    }

    if (withSymbol) {
        withSymbol[pipelineState] = state;
    }

    return state;
};

const asyncLocalStorage = new AsyncLocalStorage<CacheStateRef>();

/**
 * Creates a "cached pipeline" which can be used to execute one or more
 * functions, results of which are cached depending on the inputs passed to
 * them. The pipeline is a little smarter than a simple cache, it can detect
 * "cycles" in the pipeline and will throw an error if it detects one. This is
 * useful to reduce chances of cost blowups and prevent infinite loops when
 * non-deterministic results from LLM are cached.
 *
 * See {@link makeCachedFunction} and {@link makeCachedObservable} for more
 * details on how to create cached functions of different types.
 *
 * This will initialize the pipeline state and return a function which can be
 * used to `execute` the pipeline. The function passed should then execute one
 * or more pipeline functions, which are then executed depending on the inputs
 * passed to them and the state of the cache.
 *
 * This is also the place where we can pass parameters that affect the pipeline
 * execution, such as the location of the cache and whether to save results to
 * the cache.
 */
export function createCachedPipeline<Input, Output>(opts: {
    /**
     * Location of the cache
     */
    location: string;
    /**
     * Whether to save the results of the pipeline to the cache or not, this
     * allows disabling modifications to the cache to ensure currently cached
     * data is not overwritten.
     *
     * So if we hit the cache - we use it, but we don't save it back if we don't
     * get the hit.
     */
    saveToCache: boolean;
    /**
     * Whether to load the cache for the given function or not, this allows us
     * to disable the cache for certain functions only for debugging and testing
     * purposes.
     */
    enableCacheFor?: string[];

    pipeline: (input: Input) => Promise<Output>;
}) {
    const ctx = {
        location: opts.location,
        saveToCache: opts.saveToCache,
        enableCacheFor: opts.enableCacheFor,
    };

    initializeCacheState(ctx);

    const executePipeline = async (input: Input) => {
        try {
            const result = await opts.pipeline(input);
            await cleanCache(ctx);
            return result;
        } finally {
            logExecutionLog(ctx);
        }
    };

    const execute = async (input: Input) => {
        return asyncLocalStorage.run(ctx, () => {
            return executePipeline(input);
        });
    };

    const abort = () => {
        abortPipeline(ctx);
    };

    return {
        execute,
        abort,
    };
}

export const getPipelineStateRef = () => {
    return asyncLocalStorage.getStore();
};

export const getPipelineState = (ctx?: CacheStateRef) => {
    const withSymbol = (ctx || asyncLocalStorage.getStore()) as
        | (typeof ctx & {
              [pipelineState]: CacheState | undefined;
          })
        | undefined;

    return withSymbol?.[pipelineState];
};

import { relative } from 'path';

import { line } from '../text/line';
import { defaultDeps } from './dependencies';
import type { PipelineStateRef } from './types';

/**
 * Internal state of the pipeline
 * @internal
 */
export type PipelineState = {
    /**
     * All results from all pipeline functions are stored here, the
     * key is determined by the function name and the input hash as
     * well as the key of the function that called it.
     */
    readonly results: Map<string, unknown>;

    /**
     * Flat log of all executed pipeline functions, this is used to
     * detect cycles in the pipeline.
     */
    readonly log: string[];

    readonly saveResult: boolean;
    readonly saveInput: boolean;
    readonly enableCacheFor?: string[];

    /**
     * If set to `true` the pipeline will stop executing and throw
     * an error.
     */
    isAborted?: boolean;

    readonly deps: typeof defaultDeps;
};

export const transformState = Symbol('pipelineState');

/**
 * @internal
 */
export const initializePipelineState = (
    stateRef?: PipelineStateRef & {
        saveResult?: boolean;
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

    const withSymbol = stateRef as
        | (typeof stateRef & {
              [transformState]: PipelineState | undefined;
          })
        | undefined;

    let state = withSymbol?.[transformState];

    if (!state) {
        const location = relative(process.cwd(), stateRef?.location || '.');

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
            results: new Map<string, unknown>(),
            log: [],
            saveInput: stateRef?.saveInput ?? deps.defaultSaveInput,
            saveResult: stateRef?.saveResult ?? true,
            enableCacheFor: stateRef?.enableCacheFor,
            deps,
        };
    }

    if (withSymbol) {
        withSymbol[transformState] = state;
    }

    return state;
};

export const getPipelineState = (stateRef?: PipelineStateRef) => {
    const withSymbol = stateRef as
        | (typeof stateRef & {
              [transformState]: PipelineState | undefined;
          })
        | undefined;

    return withSymbol?.[transformState];
};

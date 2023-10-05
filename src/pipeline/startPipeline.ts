import { initializePipelineState } from './state';
import type { PipelineStateRef } from './types';

/**
 * Initializes the pipeline state and returns a reference to the
 * state object, the state object needs to be carried around and
 * passed to all pipeline functions for caching to work.
 *
 * This is also the place where we can pass parameters that affect
 * the pipeline execution, such as the location of the cache and
 * whether to save results to the cache.
 */
export function startPipeline(opts: {
    location: string;
    saveResult: boolean;
    saveInput: boolean;
    enableCacheFor?: string[];
}): PipelineStateRef {
    const stateRef = {
        location: opts.location,
        saveResult: opts.saveResult,
        saveInput: opts.saveInput,
        enableCacheFor: opts.enableCacheFor,
    };

    initializePipelineState(stateRef);

    return stateRef;
}

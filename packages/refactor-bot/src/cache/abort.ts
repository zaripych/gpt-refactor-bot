import { AbortError } from '../errors/abortError';
import { line } from '../text/line';
import type { CacheState } from './state';
import { getPipelineState } from './state';
import type { CacheStateRef } from './types';

export function abortPipeline(ctx: CacheStateRef) {
    const state = getPipelineState(ctx);
    if (state) {
        state.isAborted = true;
    } else {
        throw new Error(
            line`
                Pipeline state not initialized, you need to pass in the result
                of "startPipeline" function
            `
        );
    }
}

/**
 * @internal
 */
export function verifyIsNotAborted(state: CacheState) {
    if (state.isAborted) {
        throw new AbortError(`Pipeline has been aborted by the user`);
    }
}

import { AbortError } from '../errors/abortError';
import { line } from '../text/line';
import type { PipelineState } from './state';
import { getPipelineState } from './state';
import type { PipelineStateRef } from './types';

export function abortPipeline(stateRef: PipelineStateRef) {
    const state = getPipelineState(stateRef);
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
export function verifyIsNotAborted(state: PipelineState) {
    if (state.isAborted) {
        throw new AbortError(`Pipeline has been aborted by the user`);
    }
}

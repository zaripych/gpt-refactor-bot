import { relative } from 'path';

import { CycleDetectedError } from '../errors/cycleDetectedError';
import { getPipelineState, type PipelineState } from './state';
import type { PipelineStateRef } from './types';

export function verifyExecutedOnce(opts: {
    key: string;
    name: string;
    state: PipelineState;
    type: 'non-deterministic' | 'deterministic';
}) {
    if (opts.type === 'non-deterministic') {
        const count = opts.state.log.reduce(
            (acc, entry) => (entry === opts.key ? acc + 1 : acc),
            0
        );

        if (count > 0) {
            /**
             * @note this is cycle prevention logic - when result of a
             * non-deterministic function is cached and that leads to
             * that function being called second time with the same input,
             * we should do something to break out of the infinite loop.
             */
            throw new CycleDetectedError(
                `Cycle detected for step "${opts.name}"`,
                opts.key
            );
        }
    }
}

export function addToExecutionLog(opts: { state: PipelineState; key: string }) {
    opts.state.log.push(opts.key);
}

export function logExecutionLog(stateRef: PipelineStateRef) {
    const state = getPipelineState(stateRef);
    if (state) {
        state.deps.logger.debug(
            `Execution log:`,
            state.log.map((entry) => relative(process.cwd(), entry))
        );
    }
}

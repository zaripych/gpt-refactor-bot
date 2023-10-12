import { join } from 'path';

import type { PipelineState } from './state';

export function determineKey(opts: {
    validatedInput: unknown;
    name: string;
    location?: string;
    state: PipelineState;
}): {
    valueHash: string;
    key: string;
} {
    const { name, location, state } = opts;

    const valueHash = state.deps.hash(opts.validatedInput);
    const elementKey = [name, valueHash].join('-');
    const key = location ? join(location, elementKey) : elementKey;

    return {
        valueHash,
        key,
    };
}

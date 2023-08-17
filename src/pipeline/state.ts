import { relative } from 'path';

import { defaultDeps } from './dependencies';

export type TransformState = {
    results: Map<string, unknown>;
    log: string[];
};

export const transformState = Symbol('pipelineState');

export const initializeTransformState = (
    persistence?: { location: string },
    deps = defaultDeps
) => {
    const { logger } = deps;
    const withSymbol = persistence as
        | (typeof persistence & {
              [transformState]: TransformState | undefined;
          })
        | undefined;

    let state = withSymbol?.[transformState];

    if (!state) {
        logger.debug('Initializing new pipeline cache map', {
            location: relative(process.cwd(), persistence?.location || '.'),
        });

        state = {
            results: new Map<string, unknown>(),
            log: [],
        };
    }

    if (withSymbol) {
        withSymbol[transformState] = state;
    }

    return state;
};

export const getTransformState = (persistence?: { location: string }) => {
    const withSymbol = persistence as
        | (typeof persistence & {
              [transformState]: TransformState | undefined;
          })
        | undefined;

    return withSymbol?.[transformState];
};

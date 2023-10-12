import micromatch from 'micromatch';
import type { z } from 'zod';

import { logger } from '../logger/logger';
import { hasOneElement } from '../utils/hasOne';
import type { refactorConfigSchema } from './types';

type ModelOpts = Pick<
    z.output<typeof refactorConfigSchema>,
    'model' | 'modelByStepCode' | 'useMoreExpensiveModelsOnRetry'
> & {
    attempt?: number;
};

function determineModel(input: ModelOpts, stateRef?: { location?: string }) {
    if (stateRef?.location) {
        const location = stateRef.location;
        const matchingKeys = [...Object.keys(input.modelByStepCode)].filter(
            (stepCode) =>
                micromatch.isMatch(location, stepCode, {
                    basename: true,
                })
        );
        if (hasOneElement(matchingKeys)) {
            const key = matchingKeys[0];
            return input.modelByStepCode[key] || input.model;
        }
    }
    return input.model;
}

export function determineModelParameters(
    input: ModelOpts,
    stateRef?: { location?: string }
) {
    const model = determineModel(input, stateRef);

    const result =
        (input.attempt ?? 1) > 1
            ? {
                  model: input.useMoreExpensiveModelsOnRetry[model] || model,
              }
            : {
                  model,
              };

    logger.trace('Model parameters', result, {
        location: stateRef?.location,
    });

    return result;
}

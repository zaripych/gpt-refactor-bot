import micromatch from 'micromatch';
import { z } from 'zod';

import { logger } from '../logger/logger';
import { hasOneElement } from '../utils/hasOne';
import { refactorConfigSchema } from './types';

export const refactorConfigModelParamsSchema = refactorConfigSchema
    .pick({
        model: true,
        modelByStepCode: true,
        useMoreExpensiveModelsOnRetry: true,
    })
    .augment({
        attempt: z.number().optional(),
    });

export type RefactorConfigModelParams = z.input<
    typeof refactorConfigModelParamsSchema
>;

function determineModel(
    inputRaw: RefactorConfigModelParams,
    ctx?: { location?: string }
) {
    const input = refactorConfigModelParamsSchema.parse(inputRaw);
    if (ctx?.location) {
        const location = ctx.location;
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
    inputRaw: RefactorConfigModelParams,
    ctx?: { location?: string }
) {
    const input = refactorConfigModelParamsSchema.parse(inputRaw);
    const model = determineModel(input, ctx);

    const result =
        (input.attempt ?? 1) > 1
            ? {
                  model: input.useMoreExpensiveModelsOnRetry[model] || model,
              }
            : {
                  model,
              };

    logger.trace('Model parameters', result, {
        location: ctx?.location,
    });

    return result;
}

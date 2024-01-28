import { z } from 'zod';

import { modelsSchema } from '../chat-gpt/api';
import { ensureHasTwoElements } from '../utils/hasOne';

export const passthroughRefactorConfigSchema = z
    .object({
        name: z.string(),
        model: modelsSchema,
        objective: z.string(),
    })
    .passthrough();

const partialRefactorConfigSchema = z
    .object({
        model: modelsSchema.optional(),
        objective: z.string().optional(),
    })
    .passthrough();

export const appVariantSchema = z.object({
    name: z.string().regex(/^[a-z0-9-]+$/i),
    ref: z.string().optional(),
    repository: z.string().optional(),
    ids: z.array(z.string()).optional(),
    excludeIds: z.array(z.string()).optional(),
    command: z
        .array(z.string())
        .nonempty()
        .default(['pnpm', 'refactor-bot', 'refactor']),
    args: z.array(z.string()).optional(),
    refactorConfig: partialRefactorConfigSchema.optional(),
});

export const evaluationConfigSchema = z.object({
    model: modelsSchema,
    choices: z.number().default(3),
});

export const benchConfigSchema = z
    .object({
        variants: z
            .array(appVariantSchema)
            .transform((variants) => ensureHasTwoElements(variants)),
        refactorConfig: passthroughRefactorConfigSchema,
        evaluationConfig: evaluationConfigSchema.default({
            model: 'gpt-4-turbo-preview',
            choices: 3,
        }),
        numberOfRuns: z.number().default(1),
        maxConcurrentRefactors: z.number().default(4),
    })
    .transform((input, ctx) => {
        const variants = new Set(input.variants.map((variant) => variant.name));
        if (variants.size !== input.variants.length) {
            ctx.addIssue({
                code: 'custom',
                message: 'Variants must have unique names',
            });
            return z.NEVER;
        }
        return input;
    });

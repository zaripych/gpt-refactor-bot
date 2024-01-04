import type { AnyZodObject, ZodEffects } from 'zod';

export type SupportedZodSchemas = AnyZodObject | ZodEffects<AnyZodObject>;

export type CacheStateRef = {
    location?: string;
};

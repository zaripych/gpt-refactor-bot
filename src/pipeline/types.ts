import type { AnyZodObject, ZodEffects } from 'zod';

export type UnknownZodObject = AnyZodObject;

export type SupportedZodSchemas =
    | UnknownZodObject
    | ZodEffects<UnknownZodObject>;

export type PipelineStateRef = {
    location?: string;
};

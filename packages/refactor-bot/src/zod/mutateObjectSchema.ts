import { z } from 'zod';

function isObjectSchema<S extends z.ZodType>(
    schema: S
): schema is Extract<S, z.AnyZodObject> {
    return 'typeName' in schema._def && schema._def.typeName === 'ZodObject';
}

function isPipeSchema<S extends z.ZodType>(
    schema: S
): schema is Extract<S, z.ZodPipeline<z.ZodTypeAny, z.ZodTypeAny>> {
    return 'typeName' in schema._def && schema._def.typeName === 'ZodPipeline';
}

function isEffectSchema<S extends z.ZodType>(
    schema: S
): schema is Extract<S, z.ZodEffects<z.ZodTypeAny>> {
    return 'typeName' in schema._def && schema._def.typeName === 'ZodEffect';
}

function searchForObjectSchema<S extends z.ZodType>(
    schema: S
): {
    schema: z.AnyZodObject;
    mutate: (newSchema: z.AnyZodObject) => z.ZodType;
} {
    if (isObjectSchema(schema)) {
        return {
            schema,
            mutate: (newSchema: z.AnyZodObject) => newSchema,
        };
    } else if (isPipeSchema(schema)) {
        const result = searchForObjectSchema(schema._def.in);
        return {
            schema: result.schema,
            mutate: (newSchema: z.AnyZodObject) => {
                return z.pipeline(newSchema, schema._def.out);
            },
        };
    } else if (isEffectSchema(schema)) {
        const result = searchForObjectSchema(schema._def.schema);
        return {
            schema: result.schema,
            mutate: (newSchema: z.AnyZodObject) => {
                return z.effect(newSchema, schema._def.effect);
            },
        };
    } else {
        throw new Error(
            'Incompatible schema type, expected an object schema, pipe schema or effect schema, but got: ' +
                schema._def.description
        );
    }
}

/**
 * Mutates the underlying object schema of a Zod schema
 *
 * This function traverses the schema tree to find the first object schema
 * and applies the provided mutation function to it.
 */
export function mutateObjectSchema<S extends z.ZodType>(
    schema: S,
    mutateFn: (objectSchema: z.AnyZodObject) => z.AnyZodObject
): z.ZodType {
    const result = searchForObjectSchema(schema);
    return result.mutate(mutateFn(result.schema));
}

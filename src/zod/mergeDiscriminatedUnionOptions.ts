import type { TypeOf, ZodObject, ZodTypeAny } from 'zod';
import {
    z,
    type ZodDiscriminatedUnion,
    type ZodDiscriminatedUnionOption,
} from 'zod';

import { ensureHasTwoElements } from '../utils/hasOne';

export function mergeDiscriminatedUnionOptions<
    Key extends string,
    Options extends ZodDiscriminatedUnionOption<Key>[],
    U extends ZodDiscriminatedUnion<Key, Options>
>(
    schema: U
): ZodObject<
    U['options'][number]['shape'],
    'strip',
    ZodTypeAny,
    TypeOf<U>,
    U['_input']
> {
    const values = [...schema.optionsMap.keys()] as const;
    const primitiveSchemas = values.map(
        (value) => z.literal(value) as ZodTypeAny
    );
    const discriminatorSchema = z.union(ensureHasTwoElements(primitiveSchemas));
    return schema.options.reduce(
        (acc, current) => {
            return acc.merge(
                current.omit({
                    [schema.discriminator]: true,
                } as Parameters<typeof current.omit>[0])
            ) as typeof acc;
        },
        z.object({
            [schema.discriminator]: discriminatorSchema,
        })
    ) as unknown as ZodObject<
        U['options'][number]['shape'],
        'strip',
        ZodTypeAny,
        TypeOf<U>,
        U['_input']
    >;
}

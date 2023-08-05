import assert from 'assert';
import type { AnyZodObject, TypeOf, z, ZodEffects } from 'zod';

import { defaultDeps } from './dependencies';
import { pipeline } from './pipeline';
import type { PipelineApi } from './types';

export function lowerCamelCaseToKebabCase(str?: string) {
    if (!str) {
        throw new Error(
            `Cannot determine function name, please provide one as "name" option`
        );
    }
    return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

export function makePipelineFunction<
    InputSchema extends AnyZodObject | ZodEffects<AnyZodObject>,
    OutputSchema extends AnyZodObject
>(
    opts: {
        name?: string;
        transform: (
            input: TypeOf<InputSchema>,
            persistence?: {
                location: string;
            }
        ) => Promise<TypeOf<OutputSchema>>;
        inputSchema: InputSchema;
        resultSchema: OutputSchema;
    },
    deps = defaultDeps
): {
    (
        input: z.input<InputSchema>,
        persistence?: {
            location: string;
        }
    ): Promise<TypeOf<OutputSchema>>;
    name: string;
    inputSchema: InputSchema;
    resultSchema: OutputSchema;
    transform: (
        input: z.input<InputSchema>,
        persistence?: {
            location: string;
        }
    ) => Promise<TypeOf<OutputSchema>>;
    withPersistence: () => PipelineApi<InputSchema, TypeOf<OutputSchema>>;
} {
    const name = lowerCamelCaseToKebabCase(opts.name ?? opts.transform.name);
    const obj = {
        [name]: async (
            input: z.input<InputSchema>,
            persistence?: { location: string }
        ) => {
            return opts.transform(
                await opts.inputSchema.parseAsync(input),
                persistence
            );
        },
    };

    const target = obj[name];
    assert(target);
    const fn = Object.assign(target, {
        inputSchema: opts.inputSchema,
        resultSchema: opts.resultSchema,
        transform: target,
        withPersistence: (): PipelineApi<InputSchema, TypeOf<OutputSchema>> => {
            return pipeline(opts.inputSchema, deps).append(fn);
        },
    });

    return fn;
}

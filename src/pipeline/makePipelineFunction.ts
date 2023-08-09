import assert from 'assert';
import type { TypeOf, z } from 'zod';

import { lowerCamelCaseToKebabCase } from '../utils/lowerCamelCaseToKebabCase';
import { defaultDeps } from './dependencies';
import { pipeline } from './pipeline';
import type { PipelineApi, SupportedZodSchemas } from './types';

export function makePipelineFunction<
    InputSchema extends SupportedZodSchemas,
    OutputSchema extends SupportedZodSchemas
>(
    opts: {
        name?: string;
        type?: 'deterministic' | 'non-deterministic';
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

    /**
     * @note give name to the function to make it easier to debug
     */
    const obj = {
        [name]: async (
            input: z.input<InputSchema>,
            persistence?: { location: string }
        ) => {
            /**
             * @note add validation here when the function is called directly
             * without the pipeline
             */
            return opts.transform(
                await opts.inputSchema.parseAsync(input),
                persistence
            );
        },
    };
    const transform = obj[name];
    assert(transform);

    const element = {
        type: opts.type,
        inputSchema: opts.inputSchema,
        resultSchema: opts.resultSchema,
    };

    const fn = Object.assign(transform, {
        ...element,
        transform,
        withPersistence: (): PipelineApi<InputSchema, TypeOf<OutputSchema>> => {
            return pipeline(opts.inputSchema, deps).append({
                ...element,
                /**
                 * @note do not add validation here, it will be done by the pipeline
                 */
                transform: opts.transform,
                name,
            });
        },
    });

    return fn;
}

import type { z, ZodSchema } from 'zod';

import type { makeDependencies } from './dependencies';

export type FunctionsConfig = {
    /**
     * Whether to perform strict validation of the arguments and result
     * against the schema. This is always `true` when used by function
     * calling mechanisms, but can be set to `false` when calling the
     * function directly for testing purposes.
     */
    strict: boolean;

    /**
     * The root of the repository to use when calling the functions,
     * defaults to the return value of `findRepositoryRoot`.
     */
    repositoryRoot: string;

    /**
     * Dependencies to use when calling the functions
     */
    dependencies: typeof makeDependencies;
};

/**
 * Generic definition of a function that can be called by the bot, see
 * https://platform.openai.com/docs/guides/gpt/function-calling for
 * more information.
 *
 * Zod schema is converted to JSON schema.
 */
export type FunctionDefinition<Name extends string, Args, Result> = {
    (args: Args, config: FunctionsConfig): Promise<Result>;
    name: Name;
    description: string;
    argsSchema: ZodSchema;
    resultSchema: ZodSchema;
};

export const makeFunction = <
    Schema extends ZodSchema,
    R,
    Name extends string
>(opts: {
    argsSchema: Schema;
    resultSchema: ZodSchema;
    name: Name;
    description: string;
    implementation: (
        args: z.infer<Schema>,
        config: FunctionsConfig
    ) => Promise<R>;
}): FunctionDefinition<Name, z.infer<Schema>, R> =>
    Object.defineProperties(
        Object.assign(
            async (args: z.infer<Schema>, config: FunctionsConfig) => {
                const validatedArgs = opts.argsSchema.parse(args) as unknown;
                const result = await opts.implementation(validatedArgs, config);
                if (config.strict) {
                    return opts.resultSchema.parse(result) as unknown;
                }
                return result;
            },
            {
                description: opts.description,
                argsSchema: opts.argsSchema,
                resultSchema: opts.resultSchema,
            }
        ),
        {
            name: {
                value: opts.name,
            },
        }
    ) as unknown as FunctionDefinition<Name, z.infer<Schema>, R>;

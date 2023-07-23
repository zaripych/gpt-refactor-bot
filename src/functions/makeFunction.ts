import type { z, ZodSchema } from 'zod';

export type Opts = {
    /**
     * Whether to perform strict validation of the arguments and result
     * against the schema. This is always `true` when used by function
     * calling mechanisms, but can be set to `false` when calling the
     * function directly.
     */
    strict?: boolean;
};

/**
 * Generic definition of a function that can be called by the bot, see
 * https://platform.openai.com/docs/guides/gpt/function-calling for
 * more information.
 *
 * Zod schema is converted to JSON schema.
 */
export type FunctionDefinition<Name extends string, Args, Result> = {
    (args: Args, callOpts?: Opts): Promise<Result>;
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
    implementation: (args: z.infer<Schema>) => Promise<R>;
}): FunctionDefinition<Name, z.infer<Schema>, R> =>
    Object.defineProperties(
        Object.assign(
            async (args: z.infer<Schema>, callOpts?: Opts) => {
                const validatedArgs = opts.argsSchema.parse(args) as unknown;
                const result = await opts.implementation(validatedArgs);
                if (callOpts?.strict ?? true) {
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

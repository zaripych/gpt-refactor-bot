import type { z, ZodSchema } from 'zod';

import { sanitizeFunctionResult } from './sanitizeFunctionResult';
import type { FunctionsConfig } from './types';
import { functionsConfigSchema } from './types';

/**
 * Generic definition of a function that can be called by the bot, see
 * https://platform.openai.com/docs/guides/gpt/function-calling for
 * more information.
 *
 * Zod schema is converted to JSON schema.
 */
export type FunctionDefinition<
    Name extends string,
    Args,
    Result,
    Config extends FunctionsConfig,
> = {
    (args: Args, config: Config): Promise<Result>;
    name: Name;
    description: string;
    argsSchema: ZodSchema<unknown>;
    resultSchema: ZodSchema<unknown>;
    functionsConfigSchema: ZodSchema<Config>;
};

export const makeFunction = <
    Schema extends ZodSchema,
    Result,
    Name extends string,
    ConfigSchema extends z.ZodObject<
        typeof functionsConfigSchema.shape
    > = typeof functionsConfigSchema,
>(opts: {
    argsSchema: Schema;
    resultSchema: ZodSchema;
    functionsConfigSchema?: ConfigSchema;
    name: Name;
    description: string;
    implementation: (
        args: z.output<Schema>,
        config: z.output<ConfigSchema>
    ) => Promise<Result>;
}): FunctionDefinition<Name, z.input<Schema>, Result, z.input<ConfigSchema>> =>
    Object.defineProperties(
        Object.assign(
            async (args: z.input<Schema>, config: z.input<ConfigSchema>) => {
                const validatedArgs = opts.argsSchema.parse(args) as unknown;

                const validatedConfig = (
                    opts.functionsConfigSchema ?? functionsConfigSchema
                ).parse(config);

                const result = await opts.implementation(
                    validatedArgs,
                    validatedConfig
                );

                const validatedResult = (await opts.resultSchema.parseAsync(
                    result
                )) as unknown;

                return await sanitizeFunctionResult({
                    result: validatedResult,
                    config,
                });
            },
            {
                description: opts.description,
                argsSchema: opts.argsSchema,
                resultSchema: opts.resultSchema,
                functionsConfigSchema:
                    opts.functionsConfigSchema ?? functionsConfigSchema,
            }
        ),
        {
            name: {
                value: opts.name,
            },
        }
    ) as unknown as FunctionDefinition<
        Name,
        z.infer<Schema>,
        Result,
        z.input<ConfigSchema>
    >;

import type { z, ZodSchema } from 'zod';

import { sanitizeFunctionResult } from './sanitizeFunctionResult';
import type { FunctionsConfig } from './types';

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
    Name extends string,
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
            }
        ),
        {
            name: {
                value: opts.name,
            },
        }
    ) as unknown as FunctionDefinition<Name, z.infer<Schema>, R>;

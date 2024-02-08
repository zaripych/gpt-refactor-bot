import { realpath } from 'fs/promises';
import type { UnionToIntersection } from 'utility-types';
import { z } from 'zod';
import zodToJsonSchema from 'zod-to-json-schema';

import { makeCachedFunction } from '../cache/makeCachedFunction';
import type { CacheStateRef } from '../cache/types';
import type {
    FunctionCallMessage,
    functionResultMessageSchema,
    systemMessageSchema,
} from '../chat-gpt/api';
import { type FunctionDescription } from '../chat-gpt/api';
import { ConfigurationError } from '../errors/configurationError';
import { findRepositoryRoot } from '../file-system/findRepositoryRoot';
import type { FunctionDefinition } from './makeFunction';
import { sanitizeFunctionResult } from './sanitizeFunctionResult';
import type { FunctionsConfig } from './types';
import { functionsConfigSchema } from './types';

type FunctionDefinitionConstraint = FunctionDefinition<
    string,
    /**
     * @note this type is meant to be used as a generic type
     * constraint; not using "any" makes it much harder to
     * make this type definition work for generic functions
     * below
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any
>;

export type UnknownFunctionDefinition = FunctionDefinition<
    string,
    unknown,
    unknown,
    FunctionsConfig
>;

async function initializeRepository(opts: {
    functions: UnknownFunctionDefinition[];
    config: Partial<FunctionsConfig>;
}) {
    const functions: typeof opts.functions = [];

    const repositoryRoot =
        opts.config.repositoryRoot ?? (await findRepositoryRoot());
    /**
     * @note we replace the repositoryRoot with the real path to
     * make sure that the path is consistent across the logs, errors
     * and multiple processes as some processes (like tsc) might
     * resolve the path and print the real path instead which could
     * be confusing to parse
     */
    const realRepositoryRoot = await realpath(repositoryRoot).catch(
        () => repositoryRoot
    );
    const initializedConfig = {
        ...opts.config,
        repositoryRoot: realRepositoryRoot,
    };

    let config = await functionsConfigSchema
        .passthrough()
        .parseAsync(initializedConfig);

    for (const fn of opts.functions) {
        const result = await fn.functionsConfigSchema.safeParseAsync({
            ...config,
        });

        if (result.success) {
            config = {
                ...config,
                ...(result.data as typeof config),
            };
            functions.push(fn);
        } else {
            throw new ConfigurationError(
                `Failed to initialize the config for function "${fn.name}"`,
                {
                    cause: result.error,
                }
            );
        }
    }

    return {
        functions,
        config,
    };
}

const createExecuteFunctions = (opts: {
    functions: UnknownFunctionDefinition[];
    config: FunctionsConfig;
}) => {
    const { functions, config } = opts;

    const executeFunction = makeCachedFunction({
        name: 'exec',
        type: 'deterministic',
        inputSchema: z.object({
            name: z.string(),
            arguments: z.unknown(),
        }),
        resultSchema: z.unknown(),
        transform: async (functionCall) => {
            const fn = functions.find(
                (candidate) => candidate.name === functionCall.name
            );

            if (!fn) {
                throw new Error(`Cannot find function "${functionCall.name}"`);
            }

            return await fn(functionCall.arguments, config);
        },
    });

    const executeGptFunction = async (args: {
        functionCall: FunctionCallMessage['functionCall'];
    }): Promise<{
        message:
            | z.output<typeof systemMessageSchema>
            | z.output<typeof functionResultMessageSchema>;
    }> => {
        let parsedArgs: unknown;
        try {
            parsedArgs = JSON.parse(args.functionCall.arguments);
        } catch {
            return {
                message: {
                    role: 'system' as const,
                    content: `Cannot parse function arguments as JSON`,
                },
            };
        }

        try {
            const result = await executeFunction({
                name: args.functionCall.name,
                arguments: parsedArgs,
            });

            return {
                message: {
                    role: 'function' as const,
                    name: args.functionCall.name,
                    content: JSON.stringify(result),
                },
            };
        } catch (e) {
            return {
                message: {
                    role: 'system' as const,
                    content: await sanitizeFunctionResult({
                        result: e instanceof Error ? e.message : String(e),
                        config,
                    }),
                },
            };
        }
    };

    return {
        executeFunction,
        executeGptFunction,
    };
};

const createExportFunction = (opts: {
    functions: UnknownFunctionDefinition[];
}) => {
    const { functions } = opts;

    return (allowedFunctions: string[] | 'all') => {
        return functions
            .filter(
                (fn) =>
                    allowedFunctions === 'all' ||
                    allowedFunctions.includes(fn.name)
            )
            .map((fn) => ({
                name: fn.name,
                description: fn.description,
                parameters: zodToJsonSchema(fn.argsSchema),
            }));
    };
};

export type FunctionsRepositoryFromRegistry<
    Fns extends FunctionDefinitionConstraint[],
> = FunctionsRepository<
    Fns[number]['name'],
    UnionToIntersection<z.output<Fns[number]['functionsConfigSchema']>> &
        z.output<typeof functionsConfigSchema>,
    {
        [Name in Fns[number]['name']]: Parameters<
            Extract<Fns[number], { name: Name }>
        >[0];
    },
    {
        [Name in Fns[number]['name']]: Awaited<
            ReturnType<Extract<Fns[number], { name: Name }>>
        >;
    }
>;

export interface FunctionsRepository<
    Allowed extends string | number | symbol,
    Config extends z.output<typeof functionsConfigSchema>,
    Args,
    Results,
    Initialized extends string | number | symbol = Allowed,
> {
    config: Config;

    executeFunction<Name extends Allowed>(opts: {
        name: Name;
        arguments: Name extends keyof Args ? Args[Name] : unknown;
    }): Promise<Name extends keyof Results ? Results[Name] : unknown>;
    executeFunction(opts: {
        name: string;
        arguments: unknown;
    }): Promise<unknown>;

    executeGptFunction(
        opts: {
            functionCall: {
                name: string;
                arguments: string;
            };
        },
        ctx?: CacheStateRef
    ): Promise<{
        message:
            | z.output<typeof systemMessageSchema>
            | z.output<typeof functionResultMessageSchema>;
    }>;

    describeFunctions(): FunctionDescription[];

    addFunctions<AddFns extends FunctionDefinitionConstraint[]>(opts: {
        functions: AddFns;
        config: UnionToIntersection<
            z.output<AddFns[number]['functionsConfigSchema']>
        >;
    }): Promise<
        FunctionsRepository<
            Allowed | AddFns[number]['name'],
            Config &
                UnionToIntersection<
                    z.output<AddFns[number]['functionsConfigSchema']>
                >,
            Args & {
                [Name in AddFns[number]['name']]: Parameters<
                    Extract<AddFns[number], { name: Name }>
                >[0];
            },
            Results & {
                [Name in AddFns[number]['name']]: Awaited<
                    ReturnType<Extract<AddFns[number], { name: Name }>>
                >;
            },
            Initialized | AddFns[number]['name']
        >
    >;

    setAllowedFunctions<NewAllowed extends Initialized>(
        allowedFunctions: Record<NewAllowed, true>
    ): FunctionsRepository<NewAllowed, Config, Args, Results, Initialized>;
    setAllowedFunctions(
        allowedFunctions: string[]
    ): FunctionsRepository<string, Config, Args, Results>;
}

function createFunctionsRepository<
    Fns extends FunctionDefinitionConstraint[],
>(state: {
    functions: Fns;
    config: UnionToIntersection<z.input<Fns[number]['functionsConfigSchema']>> &
        FunctionsConfig;
}): FunctionsRepositoryFromRegistry<Fns> {
    return {
        functions: state.functions,
        config: state.config,
        ...createExecuteFunctions(state),
        describeFunctions: createExportFunction(state),
        addFunctions: async (opts: {
            functions: UnknownFunctionDefinition[];
            config: FunctionsConfig;
        }) => {
            if (
                opts.functions.some((fn) =>
                    state.functions.some((f) => f.name === fn.name)
                )
            ) {
                throw new Error('Cannot add functions with the same name');
            }

            const nextInitialization = await initializeRepository({
                functions: opts.functions,
                config: {
                    ...state.config,
                    ...opts.config,
                },
            });

            const nextState = {
                functions: [
                    ...state.functions,
                    ...nextInitialization.functions,
                ] as UnknownFunctionDefinition[],
                config: nextInitialization.config,
            };

            return createFunctionsRepository(nextState);
        },
        setAllowedFunctions: (
            allowedFunctions: string[] | Record<string, boolean>
        ) => {
            const allowedFunctionsArr = Array.isArray(allowedFunctions)
                ? allowedFunctions
                : Object.keys(allowedFunctions);
            const nextFunctions = state.functions.filter((fn) =>
                allowedFunctionsArr.includes(fn.name)
            );
            return createFunctionsRepository({
                functions: nextFunctions,
                config: state.config,
            });
        },
    } as unknown as FunctionsRepositoryFromRegistry<Fns>;
}

/**
 * This function initializes the functions repository along with the config that
 * goes with it. It then provides an API to execute the functions using the
 * config or further modify the repository.
 *
 * Every function can have its own shape of the config. It is expected to be
 * initialized by the `.transform` attached to the function's
 * `functionsConfigSchema`. The `prepareFunctionsRepository` will initialize the
 * config for each function and merge it with the global config.
 */
export async function prepareFunctionsRepository<
    Fns extends FunctionDefinitionConstraint[],
>(opts: {
    functions: Fns;
    config: UnionToIntersection<z.input<Fns[number]['functionsConfigSchema']>> &
        FunctionsConfig;
}): Promise<FunctionsRepositoryFromRegistry<Fns>> {
    const state = await initializeRepository({
        functions: opts.functions,
        config: opts.config as FunctionsConfig,
    });

    return createFunctionsRepository(
        state
    ) as unknown as FunctionsRepositoryFromRegistry<Fns>;
}

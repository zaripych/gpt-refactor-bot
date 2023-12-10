import type { Project } from 'ts-morph';
import type { AnyZodObject, ZodObject, ZodSchema } from 'zod';
import { z } from 'zod';

import { line } from '../text/line';
import { createCombinedProject } from '../ts-morph/project/createCombinedProject';
import { createProject } from '../ts-morph/project/createProject';
import { listProjects } from '../ts-morph/project/listProjects';
import { makeFunction } from './makeFunction';
import type { FunctionsConfig } from './types';

const successResultSchema = (functionResultSchema: ZodSchema) =>
    z.object({
        tsConfigFilePath: z.string().optional().describe(line`
            Path to the tsconfig.json file.
        `),
        packageName: z.string().optional().describe(line`
            Name of the package in monorepo.
        `),
        status: z.literal('success'),
        result: functionResultSchema,
    });

const errorResultSchema = z.object({
    status: z.literal('error'),
    tsConfigFilePath: z.string().optional().describe(line`
        Path to the tsconfig.json file.
    `),
    packageName: z.string().optional().describe(line`
        Name of the package in monorepo.
    `),
    error: z.object({
        message: z.string(),
    }),
});

const unionResultSchema = (functionResultSchema: ZodSchema) =>
    z.union([successResultSchema(functionResultSchema), errorResultSchema]);

export const makeTsFunction = <
    ArgSchema extends AnyZodObject,
    ResultSchema extends ZodSchema,
    Name extends string,
>(opts: {
    argsSchema: ArgSchema;
    resultSchema: ResultSchema;
    name: Name;
    description: string;
    implementation: (
        project: Project,
        config: FunctionsConfig,
        args: z.infer<ArgSchema>
    ) => Promise<z.infer<ResultSchema>>;
}) =>
    makeFunction({
        argsSchema: opts.argsSchema as unknown as ZodObject<ArgSchema['shape']>,
        resultSchema: z.array(unionResultSchema(opts.resultSchema)),
        name: opts.name,
        description: opts.description,
        implementation: async (args, config: FunctionsConfig) => {
            const { useCombinedTsMorphProject = true } = config;

            if (useCombinedTsMorphProject) {
                const { project } = await createCombinedProject(config);

                return [
                    {
                        status: 'success',
                        result: await opts.implementation(
                            project,
                            config,
                            args
                        ),
                    },
                ];
            } else {
                const results: Array<
                    z.output<ReturnType<typeof unionResultSchema>>
                > = [];

                const projects = await listProjects(config);

                for (const info of projects) {
                    const { project } = createProject({
                        tsConfigFilePath: info.tsConfigFilePath,
                    });
                    try {
                        const result = await opts.implementation(
                            project,
                            config,
                            args
                        );
                        results.push({
                            tsConfigFilePath: info.tsConfigFilePath,
                            packageName: info.packageName,
                            status: 'success' as const,
                            result,
                        });
                    } catch (err) {
                        results.push({
                            tsConfigFilePath: info.tsConfigFilePath,
                            packageName: info.packageName,
                            status: 'error',
                            error: {
                                message:
                                    err instanceof Error
                                        ? err.message
                                        : String(err),
                            },
                        });
                    }
                }

                return results;
            }
        },
    });

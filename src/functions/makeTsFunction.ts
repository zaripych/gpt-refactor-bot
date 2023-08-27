import type { Project } from 'ts-morph';
import type { AnyZodObject, ZodObject, ZodSchema } from 'zod';
import type { z } from 'zod';

import { createProject } from '../ts-morph/createProject';
import { makeFunction } from './makeFunction';
import type { FunctionsConfig } from './types';

export const makeTsFunction = <
    ArgSchema extends AnyZodObject,
    ResultSchema extends ZodSchema,
    Name extends string
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
        resultSchema: opts.resultSchema,
        name: opts.name,
        description: opts.description,
        implementation: async (args, config: FunctionsConfig) => {
            const { project } = await createProject(config);
            return opts.implementation(project, config, args);
        },
    });

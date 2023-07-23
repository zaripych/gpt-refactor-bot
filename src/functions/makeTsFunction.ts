import type { Project } from 'ts-morph';
import type { AnyZodObject, ZodObject, ZodSchema } from 'zod';
import { z } from 'zod';

import { createProject } from '../ts-morph/createProject';
import { makeFunction } from './makeFunction';

const contextSchema = z.object({
    scope: z
        .array(z.string())
        .describe(
            'List of directory names and/or internal package names to include in the analysis'
        )
        .optional(),
});

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
        args: z.infer<ArgSchema>
    ) => Promise<z.infer<ResultSchema>>;
}) =>
    makeFunction({
        argsSchema: (
            opts.argsSchema as unknown as ZodObject<ArgSchema['shape']>
        ).merge(contextSchema),
        resultSchema: opts.resultSchema,
        name: opts.name,
        description: opts.description,
        implementation: async ({ scope, ...args }) => {
            const { project } = await createProject({ scope });
            return opts.implementation(project, args);
        },
    });

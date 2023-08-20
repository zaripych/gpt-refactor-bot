import { dirname, relative } from 'path';
import { type TypeOf, z, type ZodType } from 'zod';

import { defaultDeps } from './dependencies';
import type { SupportedZodSchemas } from './types';

const save = async <Schema extends ZodType<unknown>>(
    opts: {
        location: string;
        result: unknown;
        schema: Schema;
    },
    deps = defaultDeps
) => {
    const { mkdir, writeFile, dumpYaml } = deps;

    await mkdir(dirname(opts.location), { recursive: true });
    await writeFile(
        opts.location,
        dumpYaml(await opts.schema.parseAsync(opts.result), {
            indent: 4,
            lineWidth: Number.MAX_SAFE_INTEGER,
            skipInvalid: true,
        })
    );
};

const load = async <Schema extends ZodType<unknown>>(
    opts: {
        location: string;
        schema: Schema;
    },
    deps = defaultDeps
): Promise<TypeOf<Schema>> => {
    const { readFile, loadYaml } = deps;
    const contents = await readFile(opts.location, 'utf-8');
    return (await opts.schema.parseAsync(loadYaml(contents))) as TypeOf<Schema>;
};

export const saveResult = async (
    opts: {
        location: string;
        input: unknown;
        inputSchema: SupportedZodSchemas;
        result: unknown;
        resultSchema: SupportedZodSchemas;
    },
    deps = defaultDeps
) => {
    const { saveInput, logger } = deps;

    logger.trace(`Saving data to "${relative(process.cwd(), opts.location)}"`);

    if (saveInput) {
        await save(
            {
                location: opts.location,
                result: {
                    result: await opts.resultSchema.parseAsync(opts.result),
                    input: await opts.inputSchema.parseAsync(opts.input),
                },
                schema: z.object({
                    result: opts.resultSchema,
                    input: opts.inputSchema,
                }),
            },
            deps
        );
    } else {
        await save(
            {
                location: opts.location,
                result: await opts.resultSchema.parseAsync(opts.result),
                schema: opts.resultSchema,
            },
            deps
        );
    }
};

export const loadResult = async (
    opts: {
        location: string;
        schema: SupportedZodSchemas;
    },
    deps = defaultDeps
) => {
    const { logger } = deps;

    logger.trace(
        `Loading data from "${relative(process.cwd(), opts.location)}"`
    );

    return await load(
        {
            location: opts.location,
            schema: opts.schema.or(
                z
                    .object({
                        result: opts.schema,
                    })
                    .transform((value) => value.result)
            ),
        },
        deps
    );
};

export const loadInput = async <Schema extends ZodType<unknown>>(opts: {
    location: string;
    inputSchema: Schema;
}) => {
    return await load({
        location: opts.location,
        schema: z
            .object({
                input: opts.inputSchema,
            })
            .transform((value) => value.input),
    });
};

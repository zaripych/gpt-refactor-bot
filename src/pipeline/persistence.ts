import { dirname, relative } from 'path';
import { type TypeOf, z, type ZodType } from 'zod';

import { defaultDeps } from './dependencies';
import type { SupportedZodSchemas } from './types';

const save = async <Schema extends ZodType<unknown>>(
    opts: {
        location: string;
        data: unknown;
        schema: Schema;
    },
    deps = defaultDeps
) => {
    const { mkdir, writeFile, dumpYaml } = deps;

    await mkdir(dirname(opts.location), { recursive: true });

    await writeFile(
        opts.location,
        dumpYaml(await opts.schema.parseAsync(opts.data), {
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
        result: unknown;
        resultSchema: SupportedZodSchemas;
    },
    deps = defaultDeps
) => {
    const { logger } = deps;

    logger.trace(
        `Saving result to "${relative(process.cwd(), opts.location)}"`
    );

    await save(
        {
            location: opts.location,
            data: opts.result,
            schema: opts.resultSchema,
        },
        deps
    );
};

export const saveInput = async (
    opts: {
        location: string;
        input: unknown;
        inputSchema: SupportedZodSchemas;
    },
    deps = defaultDeps
) => {
    const { logger } = deps;

    logger.trace(`Saving input to "${relative(process.cwd(), opts.location)}"`);

    await save(
        {
            location: opts.location,
            data: opts.input,
            schema: opts.inputSchema,
        },
        deps
    );
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

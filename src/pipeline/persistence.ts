import { dirname } from 'path';
import {
    type AnyZodObject,
    type TypeOf,
    z,
    type ZodEffects,
    type ZodType,
} from 'zod';

import { defaultDeps } from './dependencies';

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
        inputSchema: AnyZodObject | ZodEffects<AnyZodObject>;
        result: unknown;
        resultSchema: AnyZodObject | ZodEffects<AnyZodObject>;
    },
    deps = defaultDeps
) => {
    const { saveInput, logger } = deps;

    logger.info(`Saving data to "${opts.location}"`);

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
        schema: AnyZodObject | ZodEffects<AnyZodObject>;
    },
    deps = defaultDeps
) => {
    const { logger } = deps;

    logger.info(`Loading data from "${opts.location}"`);

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
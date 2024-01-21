import { dirname } from 'path';
import type { z, ZodType } from 'zod';
import { type TypeOf } from 'zod';

import { defaultDeps } from './dependencies';

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

export const saveEvents = async <
    Schema extends
        | z.ZodArray<z.ZodType<unknown>>
        | z.ZodEffects<z.ZodArray<z.ZodType<unknown>>>,
>(
    opts: {
        location: string;
        events: unknown;
        eventsSchema: Schema;
    },
    deps = defaultDeps
) => {
    const { logger } = deps;

    logger.trace(`Saving events`, {
        location: opts.location,
    });

    await save(
        {
            location: opts.location,
            data: opts.events,
            schema: opts.eventsSchema,
        },
        deps
    );
};

export const loadEvents = async <
    Schema extends
        | z.ZodArray<z.ZodType<unknown>>
        | z.ZodEffects<z.ZodArray<z.ZodType<unknown>>>,
>(
    opts: {
        location: string;
        eventsSchema: Schema;
    },
    deps = defaultDeps
) => {
    deps.logger.trace(`Loading events`, {
        location: opts.location,
    });

    const events = await load(
        {
            location: opts.location,
            schema: opts.eventsSchema,
        },
        deps
    );

    return events;
};

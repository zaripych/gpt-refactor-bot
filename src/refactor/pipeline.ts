import fg from 'fast-glob';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { dump, load } from 'js-yaml';
import { dirname, join } from 'path';
import type { Assign } from 'utility-types';
import type { z, ZodSchema } from 'zod';

import { makeDependencies } from './dependencies';

type StateInfo = {
    id: string;
    location: string;
};

export type PipelineElement<Input, ReturnType, Context extends StateInfo> = {
    name: string;
    transform: (input: Input, context: Context) => Promise<ReturnType>;
    resultSchema: ZodSchema;
};

type AnyPipelineElement = PipelineElement<unknown, unknown, StateInfo>;

type PipelineApi<InitialInput, LastResult, Context extends StateInfo> = {
    // building the pipeline:

    append<
        Element extends PipelineElement<
            LastResult,
            Record<never, never>,
            Context
        >
    >(
        element: Element
    ): PipelineApi<
        InitialInput,
        InitialInput extends object
            ? Assign<InitialInput, z.infer<Element['resultSchema']>>
            : InitialInput & z.infer<Element['resultSchema']>,
        Context
    >;

    // using the pipeline:

    load(opts: {
        id: string;
        location: string;
        initialInputSchema: ZodSchema;
    }): Promise<{
        initialInput: InitialInput;
    }>;

    transform(
        initialInput: InitialInput,
        context: Context
    ): Promise<LastResult>;
};

export const pipeline: <
    InitialInput,
    Context extends StateInfo = StateInfo
>() => PipelineApi<InitialInput, InitialInput, Context> = <
    InitialInput,
    Context extends StateInfo
>(
    getDeps = makeDependencies
) => {
    const { logger } = getDeps();
    const elements: Array<AnyPipelineElement> = [];
    const results: Map<string, unknown> = new Map();

    const saveResult = async (opts: { location: string; result: unknown }) => {
        logger.debug(`Saving data to "${opts.location}"`);

        await mkdir(dirname(opts.location), { recursive: true });
        await writeFile(
            opts.location,
            dump(opts.result, {
                indent: 4,
                lineWidth: Number.MAX_SAFE_INTEGER,
            })
        );
    };

    const loadResult = async (opts: {
        location: string;
        resultSchema: ZodSchema;
    }) => {
        logger.debug(`Loading data from "${opts.location}"`);

        const contents = await readFile(opts.location, 'utf-8');
        return opts.resultSchema.parse(load(contents)) as unknown;
    };

    const loadPipelineState = async (opts: {
        id: string;
        location: string;
        initialInputSchema: ZodSchema;
    }) => {
        const root = join(opts.location, opts.id);

        const stateFiles = await fg(`*.yaml`, {
            cwd: root,
        });

        if (stateFiles.length === 0) {
            throw new Error(`Cannot find any state files in "${root}"`);
        }

        logger.debug(`Found ${stateFiles.length} state files:`, stateFiles);

        const loadedResults: Map<string, unknown> = new Map();

        for (const element of elements.reverse()) {
            const file = element.name + '.yaml';
            const location = join(root, file);

            const fileExists = stateFiles.includes(file);

            if (!fileExists && loadedResults.size === 0) {
                continue;
            }

            if (!fileExists) {
                logger.warn(
                    `Missing state for "${element.name}", will continue because the state of the future task exists`
                );
                continue;
            }

            const result = await loadResult({
                location: location,
                resultSchema: element.resultSchema,
            });

            loadedResults.set(element.name, result);
        }

        const result = await loadResult({
            location: join(root, 'init.yaml'),
            resultSchema: opts.initialInputSchema,
        });

        loadedResults.set('init', result);

        loadedResults.forEach((value, key) => {
            results.set(key, value);
        });

        logger.debug('Loaded results:', results);

        return {
            initialInput: results.get('init') as InitialInput,
        };
    };

    const transform = async (initialInput: InitialInput, context: Context) => {
        logger.debug(`Executing pipeline "${context.id}"`);

        if (results.size === 0) {
            results.set('init', initialInput);

            await saveResult({
                result: initialInput,
                location: join(context.location, context.id, 'init.yaml'),
            });
        }

        return await elements.reduce<Promise<unknown>>(
            async (nextInput, { transform, name }) => {
                const value = await nextInput;

                const hasResult = results.has(name);

                if (hasResult) {
                    logger.debug(`Step "${name}" has already been run ...`);
                } else {
                    logger.debug(`Starting step "${name}" ...`);
                }

                const result = hasResult
                    ? results.get(name)
                    : await transform(value, context);

                if (!hasResult) {
                    results.set(name, result);

                    await saveResult({
                        result,
                        location: join(
                            context.location,
                            context.id,
                            name + '.yaml'
                        ),
                    });
                }

                return Object.assign(value as object, result);
            },
            Promise.resolve(initialInput)
        );
    };

    const api: PipelineApi<InitialInput, InitialInput, Context> = {
        append: (element) => {
            if (element.name === 'init') {
                throw new Error(
                    'Cannot use "init" as a name for a pipeline element'
                );
            }

            elements.push(element as unknown as AnyPipelineElement);
            return api;
        },
        transform,
        load: loadPipelineState,
    } as PipelineApi<InitialInput, InitialInput, Context>;

    return api;
};

import assert from 'assert';
import { basename, join } from 'path';
import type { TypeOf, z } from 'zod';

import { line } from '../text/line';
import { lowerCamelCaseToKebabCase } from '../utils/lowerCamelCaseToKebabCase';
import { verifyIsNotAborted } from './abort';
import { lookupResultInCache, saveResultToCache } from './cache';
import { defaultDeps } from './dependencies';
import { determineKey } from './determineKey';
import { addToExecutionLog, verifyExecutedOnce } from './log';
import { saveInput } from './persistence';
import { initializePipelineState } from './state';
import type { PipelineStateRef, SupportedZodSchemas } from './types';
import { validateInput } from './validateInput';

/**
 * Creates a pipeline function.
 *
 * The function will receive extra parameter, `stateRef`, which would need to be
 * passed down to all the pipeline functions that are called from within the
 * function.
 *
 * The function will be cached and the result will be reused if the input hash
 * is the same.
 *
 * The function will be executed only once per input hash if the type is set to
 * `'non-deterministic'`, when executed the second time it will throw with
 * {@link CycleDetectedError}.
 *
 * If the type is set to `'deterministic'` the function will be executed once,
 * when executed the second time it would return the cached result.
 *
 * To address cross-cutting concerns and side-effects the behavior of all the
 * pipeline functions can be customized by initializing the pipeline state with
 * {@link startPipeline} function and passing configuration parameters.
 */
export function makePipelineFunction<
    InputSchema extends SupportedZodSchemas,
    OutputSchema extends SupportedZodSchemas,
>(
    opts: {
        name?: string;
        type?: 'deterministic' | 'non-deterministic';
        inputSchema: InputSchema;
        resultSchema: OutputSchema;
        transform: (
            input: z.output<InputSchema> & {
                attempt?: number;
            },
            stateRef?: PipelineStateRef
        ) => Promise<TypeOf<OutputSchema>>;
    },
    deps = defaultDeps
): {
    (
        input: z.input<InputSchema> & {
            attempt?: number;
        },
        stateRef?: PipelineStateRef
    ): Promise<TypeOf<OutputSchema>>;
    name: string;
    inputSchema: InputSchema;
    resultSchema: OutputSchema;
} {
    const name = lowerCamelCaseToKebabCase(opts.name ?? opts.transform.name);

    const withCache = async (
        input: z.input<InputSchema>,
        stateRef?: PipelineStateRef
    ) => {
        const initializedStateRef = stateRef || {};
        const state = initializePipelineState(initializedStateRef, deps);

        verifyIsNotAborted(state);

        const validatedInput = await validateInput({
            input,
            inputSchema: opts.inputSchema,
            name,
        });

        const { key, valueHash } = determineKey({
            validatedInput,
            name,
            state,
            location: stateRef?.location,
        });

        if (state.saveInput && stateRef?.location) {
            await saveInput(
                {
                    location: `${key}-input.yaml`,
                    input: validatedInput,
                    inputSchema: opts.inputSchema,
                },
                state.deps
            );
        }

        const foundResult = await lookupResultInCache({
            key,
            name,
            resultSchema: opts.resultSchema,
            state,
            location: stateRef?.location,
        });

        if (foundResult) {
            deps.logger.debug(line`
                Step ${name} with the same input hash "${valueHash}" has
                already been run ...
            `);

            verifyExecutedOnce({
                key,
                name,
                state,
                type: opts.type ?? 'non-deterministic',
            });

            addToExecutionLog({
                state,
                key,
            });

            return foundResult;
        }

        deps.logger.debug(
            line`Starting step "${name}" with input hash "${valueHash}" ...`
        );

        verifyExecutedOnce({
            key,
            name,
            state,
            type: opts.type ?? 'non-deterministic',
        });

        const location = stateRef?.location
            ? join(stateRef.location, basename(key))
            : undefined;

        const result = await opts.transform(validatedInput, {
            ...initializedStateRef,
            ...(location && {
                location,
            }),
        });

        addToExecutionLog({
            state,
            key,
        });

        await saveResultToCache({
            key,
            result,
            resultSchema: opts.resultSchema,
            state,
            location: stateRef?.location,
        });

        return result;
    };

    /**
     * @note give name to the function to make it easier to debug
     */
    const obj = {
        [name]: (
            ...args: Parameters<typeof withCache>
        ): ReturnType<typeof withCache> => {
            return withCache(...args);
        },
    };

    const namedFn = obj[name];
    assert(namedFn);

    return Object.assign(namedFn, {
        type: opts.type,
        inputSchema: opts.inputSchema,
        resultSchema: opts.resultSchema,
    });
}

import type { AnyZodObject, z, ZodEffects, ZodObject, ZodTypeAny } from 'zod';

import type { RetryOpts } from '../utils/retry';

type PipelineElement<Input, ReturnType> = {
    name: string;
    transform: (
        input: Input,
        persistence?: {
            location: string;
        }
    ) => Promise<ReturnType>;
    inputSchema: AnyZodObject | ZodEffects<AnyZodObject>;
    resultSchema: AnyZodObject;
};

export type AnyPipelineElement = PipelineElement<unknown, unknown>;

export type PipelineApi<
    InputSchema extends AnyZodObject | ZodEffects<AnyZodObject>,
    Result,
    AllResults = Result
> = {
    // building the pipeline:

    /**
     * Append new transformation element
     */
    append<Element extends PipelineElement<Result, unknown>>(
        element: Element
    ): PipelineApi<
        InputSchema,
        Result & z.infer<Element['resultSchema']>,
        AllResults | z.infer<Element['resultSchema']>
    > & {
        /**
         * Defines a function that combines execution of the last `transform` call
         * with the combined results of previous `transform` calls. Also defines a
         * new result schema for the pipeline.
         */
        combineLast: <CombineType>(
            reducer: (
                input: Result,
                next: z.infer<Element['resultSchema']>
            ) => CombineType,
            resultSchema?: AnyZodObject
        ) => PipelineApi<
            InputSchema,
            CombineType,
            AllResults | z.infer<Element['resultSchema']>
        >;
    };

    /**
     * Define a reducer that combines all `transform` results into a single
     * object, also requires the result schema for combined object.
     */
    combineAll<CombinedType>(
        reducer: (previous: AllResults, next: AllResults) => CombinedType,
        resultSchema?: AnyZodObject
    ): PipelineApi<InputSchema, CombinedType, AllResults>;

    /**
     * Sets retry options for the pipeline, this also modifies the input
     * schema to include a `attempt` field, which is used to track the
     * number of retries and automatically discard the persistence for the
     * current attempt.
     */
    retry: (
        retryOpts: RetryOpts
    ) => PipelineApi<InputSchema, Result, AllResults>;

    // using the pipeline:

    transform: (
        input: z.input<InputSchema>,
        persistence?: {
            location: string;
        }
    ) => Promise<Result>;

    log: () => string[];

    clean: (persistence: { location: string }) => Promise<void>;

    abort: () => void;

    inputSchema: InputSchema;
    resultSchema: ZodObject<{ [K in keyof Result]: ZodTypeAny }>;
};

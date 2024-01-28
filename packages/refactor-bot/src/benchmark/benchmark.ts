import orderBy from 'lodash-es/orderBy';
import { join } from 'path';
import { from, lastValueFrom, mergeMap, toArray } from 'rxjs';
import { z } from 'zod';

import { makeCachedFunction } from '../cache/makeCachedFunction';
import { createCachedPipeline } from '../cache/state';
import type { CacheStateRef } from '../cache/types';
import { logger } from '../logger/logger';
import { randomText } from '../utils/randomText';
import { loadBenchmarkConfig } from './loadBenchmarkConfig';
import { reportBenchmarkSummary } from './reportBenchmarkSummary';
import { runVariant } from './runVariant';
import { summarizeRefactorResult } from './summarizeRefactorResult';

const generateId = makeCachedFunction({
    name: 'gen-id',
    inputSchema: z.object({
        variant: z.string(),
        index: z.number(),
    }),
    resultSchema: z.object({
        refactorId: z.string(),
    }),
    transform: async () => {
        return Promise.resolve({
            refactorId: randomText(8),
        });
    },
});

export async function benchmark(opts: {
    config: string;
    id?: string;
    // for debugging:
    saveToCache?: boolean;
    enableCacheFor?: string[];
    disableCacheFor?: string[];
}) {
    const config = await loadBenchmarkConfig(opts.config);

    const id = opts.id ?? randomText(8);

    logger.info('Starting benchmark run with id', { id });

    const runVariantsAndCompare = async (
        input: typeof config,
        ctx?: CacheStateRef
    ) => {
        const variantAtATime = Math.max(
            1,
            input.maxConcurrentRefactors / input.variants.length
        );
        const maxConcurrentRefactorsPerVariant = Math.max(
            1,
            input.maxConcurrentRefactors / variantAtATime
        );

        logger.debug('Running refactors for multiple variants', {
            maxConcurrentRefactors: input.maxConcurrentRefactors,
            variantAtATime,
            maxConcurrentRefactorsPerVariant,
        });

        const results = await lastValueFrom(
            from(input.variants).pipe(
                mergeMap(async (variant) => {
                    // these ids are passed in as parameter by the user
                    const preEvaluatedIds = variant.ids ?? [];
                    // these ids are generated by the benchmark
                    const newIds: string[] = [];

                    /**
                     * @note
                     *
                     * Silly, but we cache the IDs so that we can run the same
                     * benchmark again with an increased number of runs without
                     * having to re-run the previous runs from scratch
                     */
                    let i = 0;

                    while (
                        newIds.length + preEvaluatedIds.length <
                        input.numberOfRuns
                    ) {
                        const { refactorId } = await generateId(
                            {
                                index: i,
                                variant: variant.name,
                            },
                            ctx
                        );

                        if (
                            !(variant.excludeIds?.includes(refactorId) ?? false)
                        ) {
                            newIds.push(refactorId);
                        }

                        i += 1;
                    }

                    logger.debug('Refactor IDs generated:', newIds);

                    const { resultFilePaths } = await runVariant(
                        {
                            id,
                            variant,
                            numberOfRuns: input.numberOfRuns,
                            evaluationConfig: input.evaluationConfig,
                            maxConcurrentRefactors:
                                maxConcurrentRefactorsPerVariant,
                            refactorConfig: {
                                ...input.refactorConfig,
                                ...variant.refactorConfig,
                            },
                            /**
                             * @note possibly reuse the IDs from the previous
                             * run
                             */
                            ids: () => ({
                                preEvaluatedIds,
                                newIds,
                            }),
                        },
                        ctx
                    );

                    return {
                        variant: variant.name,
                        resultFilePaths,
                    };
                }, variantAtATime),
                toArray()
            )
        );

        logger.debug('Finished running refactors for multiple variants', {
            results,
        });

        const summaries = await Promise.all(
            results.map(async (result) => ({
                variant: result.variant,
                summary: await summarizeRefactorResult({
                    resultFilePaths: result.resultFilePaths,
                }),
            }))
        );

        const orderedSummaries = orderBy(summaries, ['variant']);

        await reportBenchmarkSummary({
            summaries: orderedSummaries,
        });
    };

    const { execute } = createCachedPipeline({
        location: join(`.refactor-bot/benchmarks/state`, id),
        saveToCache: opts.saveToCache ?? true,
        enableCacheFor: opts.enableCacheFor,
        disableCacheFor: opts.disableCacheFor,
        pipeline: runVariantsAndCompare,
    });

    return await execute(config);
}

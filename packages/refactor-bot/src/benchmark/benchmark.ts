import orderBy from 'lodash-es/orderBy';
import { join } from 'path';
import { from, lastValueFrom, mergeMap, toArray } from 'rxjs';

import { createCachedPipeline } from '../cache/state';
import type { CacheStateRef } from '../cache/types';
import { logger } from '../logger/logger';
import { randomText } from '../utils/randomText';
import { loadBenchmarkConfig } from './loadBenchmarkConfig';
import { reportBenchmarkSummary } from './reportBenchmarkSummary';
import { runVariant } from './runVariant';
import { summarizeRefactorResult } from './summarizeRefactorResult';

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
                                ...config.refactorConfig,
                            },
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

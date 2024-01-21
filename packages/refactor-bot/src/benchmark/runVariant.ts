import assert from 'assert';
import dedent from 'dedent';
import { mkdir, writeFile } from 'fs/promises';
import { dump } from 'js-yaml';
import { join } from 'path';
import { lastValueFrom, mergeMap, range, toArray } from 'rxjs';
import { z } from 'zod';

import { makeCachedFunction } from '../cache/makeCachedFunction';
import { spawnResult } from '../child-process/spawnResult';
import { findRepositoryRoot } from '../file-system/findRepositoryRoot';
import { logger } from '../logger/logger';
import { checkoutSandbox } from '../refactor/checkoutSandbox';
import { randomText } from '../utils/randomText';
import {
    appVariantSchema,
    evaluationConfigSchema,
    passthroughRefactorConfigSchema,
} from './benchmarkConfig';

export const runVariantSchema = z.object({
    id: z.string(),
    variant: appVariantSchema,
    refactorConfig: passthroughRefactorConfigSchema,
    evaluationConfig: evaluationConfigSchema,
    numberOfRuns: z.number(),
    maxConcurrentRefactors: z.number(),
});

export const runVariant = makeCachedFunction({
    name: 'run-variant',
    inputSchema: runVariantSchema,
    resultSchema: z.object({
        resultFilePaths: z.array(z.string()),
    }),
    transform: async (input, ctx) => {
        const repoRoot = await findRepositoryRoot();

        const newRuns = input.numberOfRuns - (input.variant.ids?.length ?? 0);

        if (newRuns === 0) {
            logger.debug('No new runs to start', {
                numberOfRunsRequired: input.numberOfRuns,
                numberOfPreEvaluatedRuns: input.variant.ids?.length ?? 0,
                maxConcurrentRefactors: input.maxConcurrentRefactors,
            });

            const resultFilePaths = (input.variant.ids ?? []).map(
                (refactorId) =>
                    join(
                        repoRoot,
                        '.refactor-bot',
                        'refactors',
                        input.refactorConfig.name,
                        'state',
                        refactorId,
                        'result.yaml'
                    )
            );

            return {
                resultFilePaths,
            };
        }

        const cliSandbox = await checkoutSandbox(
            {
                name: ['bench', input.variant.name].join('-'),
                id: input.id,
                ref: input.variant.ref,
                repository: input.variant.repository,
                allowDirtyWorkingTree: true,
            },
            ctx
        );

        const { objective, ...rest } = input.refactorConfig;

        await mkdir(
            join(
                cliSandbox.sandboxDirectoryPath,
                '.refactor-bot',
                'refactors',
                input.refactorConfig.name
            ),
            { recursive: true }
        );

        logger.debug('Created sandbox for the refactor CLI at', {
            location: cliSandbox.sandboxDirectoryPath,
        });

        const goalMd = join(
            cliSandbox.sandboxDirectoryPath,
            '.refactor-bot',
            'refactors',
            input.refactorConfig.name,
            `goal.md`
        );

        await writeFile(
            goalMd,
            dedent`
                \`\`\`yaml
                ${dump(rest)}
                \`\`\`

                ${objective}
            `
        );

        logger.debug('Written refactor config with an objective at', {
            location: goalMd,
        });

        logger.debug('Starting refactoring process', {
            numberOfRuns: input.numberOfRuns,
            numberOfPreEvaluatedRuns: input.variant.ids?.length ?? 0,
            maxConcurrentRefactors: input.maxConcurrentRefactors,
        });

        const results = await lastValueFrom(
            range(0, newRuns).pipe(
                mergeMap(async () => {
                    const refactorId = randomText(8);

                    const result = await spawnResult(
                        input.variant.command[0],
                        input.variant.command
                            .slice(1)
                            .concat([
                                '--name',
                                input.refactorConfig.name,
                                '--id',
                                refactorId,
                            ]),
                        {
                            cwd: cliSandbox.sandboxDirectoryPath,
                            output: [],
                            exitCodes: 'any',
                            stdio: 'inherit',
                            env: {
                                ...process.env,
                                LOG_RELATIVE_TO_CWD: process.cwd(),
                                CACHE_ROOT: repoRoot,
                            },
                        }
                    );

                    logger.debug('Process finished', {
                        command: input.variant.command.join(' '),
                        pid: result.pid,
                        ...(result.error && {
                            error: result.error,
                        }),
                        ...(typeof result.status === 'number' && {
                            status: result.status,
                        }),
                        ...(typeof result.signal === 'string' && {
                            signal: result.signal,
                        }),
                    });

                    assert(!result.signal, 'Failed to run refactor command');

                    return {
                        resultFilePath: join(
                            repoRoot,
                            '.refactor-bot',
                            'refactors',
                            input.refactorConfig.name,
                            'state',
                            refactorId,
                            'result.yaml'
                        ),
                    };
                }, input.maxConcurrentRefactors),
                toArray()
            )
        );

        const resultFilePaths = (input.variant.ids ?? [])
            .map((refactorId) =>
                join(
                    repoRoot,
                    '.refactor-bot',
                    'refactors',
                    input.refactorConfig.name,
                    'state',
                    refactorId,
                    'result.yaml'
                )
            )
            .concat(results.map((result) => result.resultFilePath));

        logger.debug('Result file paths below', {
            resultFilePaths,
        });

        return {
            resultFilePaths,
        };
    },
});

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
import { prettierMarkdown } from '../prettier/prettier';
import { checkoutSandbox } from '../refactor/checkoutSandbox';
import { ensureHasOneElement } from '../utils/hasOne';
import { randomText } from '../utils/randomText';
import {
    appVariantSchema,
    evaluationConfigSchema,
    passthroughRefactorConfigSchema,
} from './benchmarkConfig';

export const runVariantSchema = z.object({
    id: z.string(),
    variant: appVariantSchema.omit({
        ids: true,
        excludeIds: true,
    }),
    refactorConfig: passthroughRefactorConfigSchema,
    evaluationConfig: evaluationConfigSchema,
    numberOfRuns: z.number(),
    maxConcurrentRefactors: z.number(),

    ids: z
        .function(
            z.tuple([]),
            z.object({
                preEvaluatedIds: z.array(z.string()),
                newIds: z.array(z.string()),
            })
        )
        .optional(),
});

const runRefactor = makeCachedFunction({
    name: 'run',
    inputSchema: z.object({
        name: z.string(),
        refactorId: z.string(),
        cacheRoot: z.string(),
        sandboxDirectoryPath: z.string(),
        command: z.array(z.string()).nonempty(),
    }),
    resultSchema: z.object({
        resultFilePath: z.string(),
    }),
    transform: async (input) => {
        const result = await spawnResult(
            input.command[0],
            input.command
                .slice(1)
                .concat(['--name', input.name, '--id', input.refactorId]),
            {
                cwd: input.sandboxDirectoryPath,
                output: [],
                exitCodes: 'any',
                stdio: 'inherit',
                env: {
                    ...process.env,
                    LOG_RELATIVE_TO_CWD: process.cwd(),
                    CACHE_ROOT: input.cacheRoot,
                },
            }
        );

        logger.debug('Process finished', {
            command: input.command.join(' '),
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
                input.cacheRoot,
                '.refactor-bot',
                'refactors',
                input.name,
                'state',
                input.refactorId,
                'result.yaml'
            ),
        };
    },
});

export const runVariant = makeCachedFunction({
    name: 'run-variant',
    inputSchema: runVariantSchema,
    resultSchema: z.object({
        resultFilePaths: z.array(z.string()),
    }),
    transform: async (input, ctx) => {
        const repoRoot = await findRepositoryRoot();

        const preEvaluatedIds = input.ids?.()?.preEvaluatedIds ?? [];
        const newIds = input.ids?.()?.newIds ?? [];

        if (
            Math.max(0, input.numberOfRuns - preEvaluatedIds.length) !==
            newIds.length
        ) {
            throw new Error('Not enough new IDs passed in');
        }

        if (newIds.length === 0) {
            logger.debug('No new runs to start', {
                numberOfRunsRequired: input.numberOfRuns,
                numberOfPreEvaluatedRuns: preEvaluatedIds.length,
                maxConcurrentRefactors: input.maxConcurrentRefactors,
            });

            const resultFilePaths = preEvaluatedIds.map((refactorId) =>
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
            await prettierMarkdown({
                repositoryRoot: cliSandbox.sandboxDirectoryPath,
                md: dedent`
                    \`\`\`yaml
                    ${dump(rest)}
                    \`\`\`

                    ${objective}
                `,
            })
        );

        logger.debug('Written refactor config with an objective at', {
            location: goalMd,
        });

        logger.debug('Starting refactoring process', {
            numberOfRuns: input.numberOfRuns,
            numberOfPreEvaluatedRuns: preEvaluatedIds.length,
            maxConcurrentRefactors: input.maxConcurrentRefactors,
        });

        const results = await lastValueFrom(
            range(0, newIds.length).pipe(
                mergeMap(async (i) => {
                    return runRefactor(
                        {
                            refactorId: newIds[i] ?? randomText(8),
                            cacheRoot: repoRoot,
                            sandboxDirectoryPath:
                                cliSandbox.sandboxDirectoryPath,
                            name: input.refactorConfig.name,
                            command: ensureHasOneElement(
                                input.variant.command.concat(
                                    input.variant.args || []
                                )
                            ),
                        },
                        ctx
                    );
                }, input.maxConcurrentRefactors),
                toArray()
            )
        );

        const resultFilePaths = preEvaluatedIds
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

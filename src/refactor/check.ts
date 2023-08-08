import { z } from 'zod';

import { diffHash } from '../git/diffHash';
import { filesDiffHash } from '../git/filesDiffHash';
import { gitRevParse } from '../git/gitRevParse';
import { runCheckCommand } from '../package-manager/runCheckCommand';
import { makePipelineFunction } from '../pipeline/makePipelineFunction';
import { scriptSchema } from './types';

const checkInputSchema = z
    .object({
        packageManager: z.enum(['npm', 'yarn', 'pnpm']),
        scripts: z.array(scriptSchema),
        filePaths: z.array(z.string()).optional(),
        location: z.string(),
        startCommit: z.string(),
    })
    .transform(async (input) => ({
        ...input,
        /**
         * @note result of this task depends on the source code state
         */
        ...(input.filePaths
            ? await filesDiffHash({
                  location: input.location,
                  ref: input.startCommit,
                  filePaths: input.filePaths,
              })
            : await diffHash({
                  location: input.location,
                  ref: input.startCommit,
              })),
    }));

const checkResultSchema = z.object({
    commit: z.string(),
    diffHash: z.string(),
    issues: z.array(z.string()),
});

export const check = makePipelineFunction({
    name: 'check',
    type: 'deterministic',
    inputSchema: checkInputSchema,
    resultSchema: checkResultSchema,
    transform: async (opts) => {
        const commit = await gitRevParse({
            location: opts.location,
            ref: 'HEAD',
        });
        const results = await Promise.all(
            opts.scripts.map((script) =>
                runCheckCommand({
                    ...opts,
                    script,
                })
            )
        );
        return {
            commit,
            diffHash:
                'filesDiffHash' in opts ? opts.filesDiffHash : opts.diffHash,
            issues: results.reduce((acc, result) => acc.concat(result), []),
        };
    },
});

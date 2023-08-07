import { z } from 'zod';

import { diffHash } from '../git/diffHash';
import { filesDiffHash } from '../git/filesDiffHash';
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
        ...(input.startCommit && input.filePaths
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
    issues: z.array(z.string()),
});

export const check = makePipelineFunction({
    name: 'check',
    inputSchema: checkInputSchema,
    resultSchema: checkResultSchema,
    transform: async (opts) => {
        const results = await Promise.all(
            opts.scripts.map((script) =>
                runCheckCommand({
                    ...opts,
                    script,
                })
            )
        );
        return {
            issues: results.reduce((acc, result) => acc.concat(result), []),
        };
    },
});

import { z } from 'zod';

import { checkoutSandboxResultSchema } from '../refactor/checkoutSandbox';
import { planFilesResultSchema } from '../refactor/planFiles';
import {
    llmUsageEntrySchema,
    refactorFilesResultSchema,
} from '../refactor/types';

/**
 * @note this is a copy of the refactor result schema that is used in the
 * ../refactor/resultsCollector.ts file - we maintain a second copy here so
 * that we can introduce breaking changes to the refactor result schema and
 * "migrate" the old format to the new format using this schema here, if we
 * have to.
 */
export const refactorResultSchema = z
    .object({
        objective: z.string(),
        status: z.enum(['success', 'failure']),
        error: z.record(z.unknown()).optional(),
    })
    .merge(checkoutSandboxResultSchema)
    .merge(refactorFilesResultSchema)
    .augment({
        planFilesResults: z.array(planFilesResultSchema).optional(),
        usage: z.array(llmUsageEntrySchema),
        performance: z.object({
            totalDurationMs: z.number(),
            durationMsByStep: z.record(
                z.object({
                    durationMs: z.number(),
                })
            ),
        }),
    });

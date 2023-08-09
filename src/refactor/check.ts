import { z } from 'zod';

import { diffHash } from '../git/diffHash';
import { filesDiffHash } from '../git/filesDiffHash';
import { gitRevParse } from '../git/gitRevParse';
import { runCheckCommand } from '../package-manager/runCheckCommand';
import { makePipelineFunction } from '../pipeline/makePipelineFunction';
import type { CheckIssuesResult, Issue } from './types';
import { checkIssuesResultSchema, scriptSchema } from './types';

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

export const check = makePipelineFunction({
    name: 'check',
    type: 'deterministic',
    inputSchema: checkInputSchema,
    resultSchema: checkIssuesResultSchema,
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
            issues: results.reduce((acc, result) => acc.concat(result), []),
            checkedFiles: opts.filePaths,
        };
    },
});

export const analyzeCheckIssuesResults = (opts: {
    issues: Issue[];
    checkResult: CheckIssuesResult;
}) => {
    const newIssues: Issue[] = [];
    const resolvedIssues: Issue[] = [];

    const existingIssues = new Set(opts.issues.map((issue) => issue.issue));
    const checkIssues = new Set(
        opts.checkResult.issues.map((issue) => issue.issue)
    );

    for (const issue of opts.checkResult.issues) {
        if (existingIssues.has(issue.issue)) {
            continue;
        }
        newIssues.push({
            ...issue,
            commit: opts.checkResult.commit,
        });
    }

    for (const issue of opts.issues) {
        if (!checkIssues.has(issue.issue)) {
            continue;
        }
        resolvedIssues.push({
            ...issue,
            commit: opts.checkResult.commit,
        });
    }

    return {
        issues: opts.checkResult.issues.map((issue) => ({
            ...issue,
            commit: opts.checkResult.commit,
        })),
        newIssues,
        resolvedIssues,
    };
};

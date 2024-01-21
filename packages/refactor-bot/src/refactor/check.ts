import assert from 'assert';
import { z } from 'zod';

import { makeCachedFunction } from '../cache/makeCachedFunction';
import { diffHash } from '../git/diffHash';
import { filesDiffHash } from '../git/filesDiffHash';
import { runCheckCommand } from '../package-manager/runCheckCommand';
import type { CheckIssuesResult, Issue, RefactorConfig } from './types';
import { checkIssuesResultSchema } from './types';

export const scriptSchema = z.object({
    args: z.array(z.string()).nonempty(),
});

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

export const check = makeCachedFunction({
    name: 'check',
    type: 'deterministic',
    inputSchema: checkInputSchema,
    resultSchema: checkIssuesResultSchema,
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
            location: opts.location,
            commands: results.map((result) => result.args.join(' ')),
            issues: results.reduce(
                (acc, result) => acc.concat(result.issues),
                [] as (typeof results)[number]['issues']
            ),
            checkedFiles: opts.filePaths,
        };
    },
});

export const checkScriptsFromConfig = (
    config: Pick<RefactorConfig, 'tsc' | 'eslint' | 'jest'>,
    discoverResults: {
        tsc: boolean;
        eslint: boolean;
        jest: boolean;
    }
) => {
    const scripts = [];

    const keys = ['tsc', 'eslint', 'jest'] as const;

    for (const key of keys) {
        const defaultConfig = {
            args: [key],
        };

        const configValue = config[key];
        if (typeof configValue === 'boolean') {
            if (configValue) {
                scripts.push(defaultConfig);
            }
        } else if (typeof configValue === 'object') {
            scripts.push({
                ...defaultConfig,
                args: configValue.args,
            });
        } else {
            if (discoverResults[key]) {
                scripts.push(defaultConfig);
            }
        }
    }

    return z.array(scriptSchema).parse(scripts);
};

export const checksSummary = (opts: {
    issues: Issue[];
    checkResult: CheckIssuesResult;
    checkCommit: string;
}) => {
    const newIssues: Issue[] = [];
    const resolvedIssues: Issue[] = [];
    const remainingIssues: Issue[] = [];

    const previousChecks = new Map(
        opts.issues.map((issue) => [issue.issue, issue])
    );
    const lastCheck = new Set(
        opts.checkResult.issues.map((issue) => issue.issue)
    );

    for (const issue of opts.checkResult.issues) {
        const existing = previousChecks.get(issue.issue);
        if (existing) {
            remainingIssues.push(existing);
        } else {
            newIssues.push({
                ...issue,
                commit: opts.checkCommit,
            });
        }
    }

    for (const issue of opts.issues) {
        if (!lastCheck.has(issue.issue)) {
            resolvedIssues.push(issue);
        }
    }

    assert(
        opts.checkResult.issues.length ===
            newIssues.length + remainingIssues.length,
        'check result issues length mismatch'
    );

    return {
        newIssues,
        remainingIssues,
        resolvedIssues,
        commands: opts.checkResult.commands,
        totalNumberOfIssues: newIssues.length + remainingIssues.length,
    };
};

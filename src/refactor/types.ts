import { z } from 'zod';

import { modelsSchema } from '../chat-gpt/api';

export const scriptSchema = z.object({
    args: z.array(z.string()).nonempty(),
    parse: z.enum(['stdout', 'stderr'] as const),
    supportsFileFiltering: z.boolean(),
});

export const refactorConfigSchema = z.object({
    /**
     * Short name of the refactoring
     */
    name: z.string(),

    /**
     * Objective of the refactor
     */
    objective: z.string(),

    /**
     * GitHub repository which is the target of the refactor, could be
     * undefined if the target is current repository.
     */
    repository: z.string().url().optional(),

    /**
     * git ref to start the refactor from, could be undefined if the
     * target is currently checked out ref.
     */
    ref: z.string().optional(),

    /**
     * Whether to allow modified files in the working tree, before
     * starting the refactor. Defaults to false.
     */
    allowDirtyWorkingTree: z.boolean().optional().default(false),

    /**
     * Globs that represent files to be refactored, this can also be
     * automatically inferred from the goal description.
     */
    target: z.array(z.string()).optional(),

    /**
     * Maximum amount of money we can spend on a single run
     */
    budgetCents: z.number().optional().default(10_00),

    /**
     * An optional list of package.json scripts to run before the
     * refactor starts
     */
    bootstrapScripts: z.array(z.string()).optional(),

    /**
     * The default model to use for the refactor
     */
    model: modelsSchema.optional().default('gpt-3.5-turbo'),

    /**
     * A map of step codes to models to use for that step
     */
    modelByStepCode: z.record(modelsSchema).optional().default({
        '**/enrich*': 'gpt-4',
        '**/plan*': 'gpt-4',
    }),

    /**
     * Whether to use a more expensive model when a step fails due
     * to the model not being able to generate a processable result.
     */
    useMoreExpensiveModelsOnRetry: z
        .record(modelsSchema, modelsSchema)
        .optional()
        .default({
            'gpt-3.5-turbo': 'gpt-4',
        }),

    /**
     * An optional list of package.json scripts to run after code
     * changes to lint and check the changed files for errors. Defaults
     * to ['tsc', 'eslint'].
     */
    lintScripts: z
        .array(
            z.object({
                args: z.array(z.string()).nonempty(),
                parse: z.enum(['stdout', 'stderr'] as const),
                supportsFileFiltering: z.boolean(),
            })
        )
        .default([
            {
                args: ['tsc'],
                parse: 'stdout',
                supportsFileFiltering: false,
            },
            {
                args: ['eslint'],
                parse: 'stdout',
                supportsFileFiltering: true,
            },
        ]),

    /**
     * An optional list of package.json scripts to run after code
     * changes to test the changed files. Defaults to ['jest'].
     *
     * When `jest` is used as a test runner, the `--findRelatedTests`
     * flag is used to only run tests that are related to the changed
     * files.
     */
    testScripts: z
        .array(
            z.object({
                args: z.array(z.string()).nonempty(),
                parse: z.enum(['stdout', 'stderr'] as const),
                supportsFileFiltering: z.boolean(),
            })
        )
        .default([
            {
                args: ['jest'],
                parse: 'stdout',
                supportsFileFiltering: true,
            },
        ]),
});

export type RefactorConfig = z.input<typeof refactorConfigSchema>;

export const refactorStepResultSchema = z.object({
    task: z.string(),
    fileContents: z.string(),
    commit: z.string(),
});

export type RefactorStepResult = z.infer<typeof refactorStepResultSchema>;

export const issueSchema = z.object({
    command: z.string(),
    issue: z.string(),
    filePath: z.string(),
    commit: z.string(),
    code: z.string().optional(),
});

export const refactorFileResultSchema = z.object({
    status: z.enum(['success', 'failure']),
    failureDescription: z.string().optional(),
    filePath: z.string(),
    issues: z.array(issueSchema),
    steps: z.array(refactorStepResultSchema),
    lastCommit: z.string().optional(),
});

export type RefactorFileResultSchema = z.infer<typeof refactorFileResultSchema>;

export const refactorFilesResultSchema = z.record(
    z.string(),
    z.array(refactorStepResultSchema)
);

export type RefactorFilesResult = z.infer<typeof refactorFilesResultSchema>;

export const refactorResultSchema = z.object({
    files: refactorFilesResultSchema,
});

export type RefactorResult = z.infer<typeof refactorResultSchema>;

export const lastCommit = <T extends { commit: string }>(steps: T[]) => {
    return steps[steps.length - 1]?.commit;
};

export const mergeRefactorFilesResults = (opts: {
    from: RefactorFilesResult;
    into: RefactorFilesResult;
}) => {
    for (const [file, tasks] of Object.entries(opts.from)) {
        const existing = opts.into[file];
        if (existing) {
            opts.into[file] = existing.concat(tasks);
        } else {
            opts.into[file] = tasks;
        }
    }
};

export const mergedRefactorFilesResults = (
    a: RefactorFilesResult,
    b: RefactorFilesResult
) => {
    const files: RefactorFilesResult = { ...a };
    mergeRefactorFilesResults({
        from: b,
        into: files,
    });
    return files;
};

export type Issue = z.infer<typeof issueSchema>;

export const checkIssuesResultSchema = z.object({
    checkedFiles: z.array(z.string()).optional(),
    issues: z.array(
        z.object({
            command: z.string(),
            issue: z.string(),
            filePath: z.string(),
            code: z.string().optional(),
        })
    ),
    commit: z.string(),
});

export type CheckIssuesResult = z.infer<typeof checkIssuesResultSchema>;

import { z } from 'zod';

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

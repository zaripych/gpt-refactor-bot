import { z } from 'zod';

import { modelsSchema } from '../chat-gpt/api';
import { functionsConfigSchema } from '../functions/types';
import { randomText } from '../utils/randomText';

export const refactorConfigSchema = z.object({
    /**
     * Short name of the refactor, should be a valid directory name
     * and also used as a git branch name.
     */
    name: z.string(),

    /**
     * Objective of the refactor, the objective is read from a goal.md file
     * in a directory located at the root of the repository:
     *
     * `.refactor-bot/refactors/${name}/goal.md`
     *
     * The `goal.md` file is a markdown file can have a frontmatter section
     * with fields that map to the fields of this schema. The frontmatter
     * section is optional.
     */
    objective: z.string(),

    /**
     * Name of the `tsconfig.json` file to use for the refactor, defaults
     * to `tsconfig.json`. In mono-repos scenarios this will affect the name
     * of every `tsconfig.json` file for every package.
     */
    tsConfigJsonFileName: functionsConfigSchema.shape.tsconfigJsonFileName,

    /**
     * List of package names or directory names where tsconfig.json files
     * are to be found, to include in the refactoring process. If
     * not specified all tsconfig.json files in the repository are included.
     */
    scope: functionsConfigSchema.shape.scope,

    /**
     * List of file globs to ignore when copying the repository to the
     * sandbox directory.
     *
     * This also affects `tsconfig.json` files lookup.
     *
     * When overriding this value, make sure to include the default
     * value as well: `['**\/node_modules\/**', '.env*', '.vscode\/**']`
     */
    ignore: functionsConfigSchema.shape.ignore,

    /**
     * List of globs pointing to .gitignore-style files with patterns to
     * ignore when copying the repository to the sandbox directory.
     *
     * When overriding this value, consider including the default value
     * as well: `['.gitignore']`
     */
    ignoreFiles: functionsConfigSchema.shape.ignoreFiles,

    /**
     * A git repository which is the target of the refactor, could be
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
     * `eslint` is supported by default as a checker for the code produced
     * by the model during refactor. It also can serve as a formatter in
     * addition to the `prettier` formatter.
     *
     * Whether to enable or disable `eslint` is determined by auto-discovery
     * mechanism which checks `package.json` and the root of the repository
     * for configs.
     *
     * When `eslint` is used as a linter, the `--fix` flag is used to
     * automatically fix eslint issues produced by the models. This behavior
     * cannot be disabled without disabling `eslint` entirely.
     */
    eslint: z
        .boolean()
        .or(
            z.object({
                args: z.array(z.string()).nonempty(),
            })
        )
        .optional(),

    /**
     * `jest` is supported as a testing framework to automatically run
     * tests after code changes produced by the model during refactor.
     *
     * Whether to enable or disable `jest` is determined by auto-discovery
     * mechanism which checks `package.json` and the root of the repository
     * for configs.
     *
     * When `jest` is used as a test runner, the `--findRelatedTests`
     * flag is used to only run tests that are related to the changed
     * files.
     */
    jest: z
        .boolean()
        .or(
            z.object({
                args: z.array(z.string()).nonempty(),
            })
        )
        .optional(),

    /**
     * `tsc` is supported as a type checker to automatically check for
     * type errors after code changes produced by the model during refactor.
     *
     * `tsc` is always enabled, but can be configured to use custom arguments.
     */
    tsc: z
        .object({
            args: z.array(z.string()).nonempty(),
        })
        .optional(),

    /**
     * Unique identifier of the refactor, used to identify and restore
     * the refactor state and finding the right sandbox when running
     * multiple times.
     */
    id: z.string().default(() => randomText(8)),
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

export const refactorSuccessResultSchema = z.object({
    status: z.literal('success'),
    filePath: z.string(),
    issues: z.array(issueSchema),
    steps: z.array(refactorStepResultSchema),
    lastCommit: z.string().optional(),
});

export const refactorFailedResultSchema = z.object({
    status: z.literal('failure'),
    failureDescription: z.string(),
    filePath: z.string(),
    issues: z.array(issueSchema),
    steps: z.array(refactorStepResultSchema),
    lastCommit: z.string().optional(),
});

export const refactorResultSchema = z.discriminatedUnion('status', [
    refactorSuccessResultSchema,
    refactorFailedResultSchema,
]);

export type RefactorResult = z.infer<typeof refactorResultSchema>;

export const refactorFileResultSchema = z.object({
    file: refactorResultSchema,
});

export type RefactorFileResult = z.infer<typeof refactorFileResultSchema>;

export const refactorFilesRecordSchema = z.record(
    z.string(),
    z.array(refactorResultSchema)
);

export type RefactorResultByFilePathRecord = z.infer<
    typeof refactorFilesRecordSchema
>;

export const refactorFilesResultSchema = z.object({
    accepted: z.record(z.string(), z.array(refactorResultSchema)),
    discarded: z.record(z.string(), z.array(refactorResultSchema)),
});

export type RefactorFilesResult = z.infer<typeof refactorFilesResultSchema>;

export const lastCommit = <T extends { commit: string }>(steps: T[]) => {
    return steps[steps.length - 1]?.commit;
};

export const pushRefactorFileResults = (opts: {
    result: RefactorResult;
    into: RefactorResultByFilePathRecord;
}) => {
    const array = opts.into[opts.result.filePath];
    if (array) {
        array.push(opts.result);
    } else {
        opts.into[opts.result.filePath] = [opts.result];
    }
};

export const mutateToMergeRefactorRecords = (opts: {
    from: RefactorResultByFilePathRecord;
    into: RefactorResultByFilePathRecord;
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

export const mutateToMergeRefactorFilesResults = (opts: {
    from: RefactorFilesResult;
    into: RefactorFilesResult;
}) => {
    mutateToMergeRefactorRecords({
        from: opts.from.accepted,
        into: opts.into.accepted,
    });
    mutateToMergeRefactorRecords({
        from: opts.from.discarded,
        into: opts.into.discarded,
    });
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
});

export type CheckIssuesResult = z.infer<typeof checkIssuesResultSchema>;

import { z } from 'zod';

import { modelsSchema } from '../chat-gpt/api';
import type { FunctionsRepositoryFromRegistry } from '../functions/prepareFunctionsRepository';
import { allowedFunctionsSchema, type functions } from '../functions/registry';
import { functionsConfigSchema } from '../functions/types';
import { randomText } from '../utils/randomText';
import type { CodeCheckingDeps } from './code-checking/prepareCodeCheckingDeps';
import type { CodeFormattingDeps } from './code-formatting/prepareCodeFormattingDeps';
import type { LlmDependencies } from './llm/llmDependencies';

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
     * List of files to edit or refactor - the refactoring will be done in the
     * same order as the files are specified here. File names should be relative
     * to the repository root.
     *
     * When not explicitly specified, the files are determined from the
     * objective. When the objective doesn't explicitly state the files to be
     * edited or refactored, the files are determined automatically by the LLM
     * by analyzing the objective and contents of the repository.
     */
    filesToEdit: z.array(z.string()).nonempty().optional(),

    /**
     * Name of the `tsconfig.json` file to use for the refactor, defaults
     * to `tsconfig.json`. In mono-repos scenarios this will affect the name
     * of every `tsconfig.json` file for every package.
     */
    tsConfigJsonFileName: functionsConfigSchema.shape.tsConfigJsonFileName,

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
     * List of function names allowed to be called during refactor
     */
    allowedFunctions: allowedFunctionsSchema,

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
    model: modelsSchema.optional().default('gpt-4-turbo-preview'),

    /**
     * A map of step codes to models to use for that step
     */
    modelByStepCode: z.record(modelsSchema).optional().default({}),

    /**
     * Whether to use a more expensive model when a step fails due
     * to the model not being able to generate a processable result.
     */
    useMoreExpensiveModelsOnRetry: z
        .record(modelsSchema, modelsSchema)
        .optional()
        .default({
            'gpt-3.5-turbo': 'gpt-4-turbo-preview',
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
     * Whether to evaluate every file before accepting it as success and
     * committing it to the repository.
     *
     * This will lead to a slower refactor, but will ensure that the files
     * reported as refactored are actually valid and lead to a reported outcome
     * that we can rely on.
     */
    evaluate: z.boolean().optional().default(true),

    /**
     * Minimal score to accept a file as refactored, only used when the
     * `evaluate` option is enabled. Defaults to 0.5.
     */
    evaluateMinScore: z.number().optional().default(0.5),

    /**
     * Unique identifier of the refactor, used to identify and restore
     * the refactor state and finding the right sandbox when running
     * multiple times.
     */
    id: z.string().default(() => randomText(8)),
});

export type RefactorConfig = z.input<typeof refactorConfigSchema>;

export type FunctionsRepositoryDeps = FunctionsRepositoryFromRegistry<
    typeof functions
> & {
    _brand?: 'FunctionsRepositoryDeps';
};

export const functionsRepositorySchema = z
    .function(z.tuple([]))
    .returns(z.custom<FunctionsRepositoryDeps>());

export const checkDependenciesSchema = z
    .function(z.tuple([]))
    .returns(z.custom<CodeCheckingDeps>());

export const formatDependenciesSchema = z
    .function(z.tuple([]))
    .returns(z.custom<CodeFormattingDeps>());

export const llmDependenciesSchema = z
    .function(z.tuple([]))
    .returns(z.custom<LlmDependencies>());

export const issueSchema = z.object({
    command: z.string(),
    issue: z.string(),
    filePath: z.string(),
    commit: z.string(),
    code: z.string().optional(),
});

export const checkSummarySchema = z.object({
    newIssues: z.array(issueSchema),
    remainingIssues: z.array(issueSchema),
    resolvedIssues: z.array(issueSchema),
    totalNumberOfIssues: z.number(),
});

export const refactorStepResultSchema = z.object({
    task: z.string(),
    key: z.string().optional(),
    fileContents: z.string(),
    commit: z.string().optional(),
    timestamp: z.number(),
    checkSummary: checkSummarySchema.optional(),
});

export const refactorStepEmptyResultSchema = z.object({
    task: z.string(),
    commit: z.string(),
    timestamp: z.number(),
    checkSummary: checkSummarySchema,
});

export type RefactorStepResult = z.infer<typeof refactorStepResultSchema>;

export const refactorSuccessResultSchema = z.object({
    status: z.literal('success'),
    filePath: z.string(),
    issues: z.array(issueSchema),
    steps: z.array(refactorStepResultSchema),
    lastCommit: z.string().optional(),
    timestamp: z.number(),
});

export const refactorFailedResultSchema = z.object({
    status: z.literal('failure'),
    failureDescription: z.string(),
    filePath: z.string(),
    issues: z.array(issueSchema),
    steps: z.array(refactorStepResultSchema),
    lastCommit: z.string().optional(),
    timestamp: z.number(),
});

export const refactorResultSchema = z.discriminatedUnion('status', [
    refactorSuccessResultSchema,
    refactorFailedResultSchema,
]);

export type RefactorResult = z.infer<typeof refactorResultSchema>;

export const llmUsageEntrySchema = z.object({
    model: z.string(),
    steps: z.array(z.string()),
    usage: z.object({
        promptTokens: z.number(),
        completionTokens: z.number(),
        totalTokens: z.number(),
    }),
});

export const evaluateFileScoreSchema = z.object({
    key: z.string().optional(),
    score: z.number(),
});

export const refactorFileResultSchema = z.object({
    /**
     * Optional key to identify the file in the cache - for diagnostic
     * purposes only.
     */
    key: z.string().optional(),
    file: refactorResultSchema,
    usage: z.array(llmUsageEntrySchema),
    evaluation: evaluateFileScoreSchema.optional(),
});

export type RefactorFileResult = z.infer<typeof refactorFileResultSchema>;

export const refactorFilesResultSchema = z.object({
    accepted: z.array(refactorFileResultSchema),
    discarded: z.array(refactorFileResultSchema),
});

export type RefactorFilesResult = z.infer<typeof refactorFilesResultSchema>;

export const firstCommit = <T extends { commit: string }>(steps: T[]) => {
    const first = steps[0];
    if (!first) {
        return undefined;
    }
    return first.commit;
};

export const lastCommit = <T extends { commit?: string; lastCommit?: string }>(
    steps: T[]
) => {
    const last = steps.filter((step) => step.commit || step.lastCommit)[
        steps.length - 1
    ];
    if (!last) {
        return undefined;
    }
    return last.commit || last.lastCommit;
};

export const lastTimestamp = <T extends { timestamp: number }>(steps: T[]) => {
    return steps[steps.length - 1]?.timestamp;
};

export type Issue = z.infer<typeof issueSchema>;

export const checkIssuesResultSchema = z.object({
    checkedFiles: z.array(z.string()).optional(),
    commands: z.array(z.string()),
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

export const summarizeRefactorFileResultArray = (
    results: Array<RefactorFileResult>
) => {
    const filePaths = results.map((result) => result.file.filePath);
    return {
        resultsByFilePaths: Object.fromEntries(
            filePaths.map((filePath) => [
                filePath,
                results.filter((result) => result.file.filePath === filePath),
            ])
        ),
        usageByFilePaths: Object.fromEntries(
            filePaths.map((filePath) => [
                filePath,
                results
                    .filter((result) => result.file.filePath === filePath)
                    .flatMap((result) => result.usage),
            ])
        ),
    };
};

export const summarizeRefactorFilesResult = (
    results: RefactorFilesResult,
    opts?: {
        filterOutDuplicatesFromDiscarded?: boolean;
    }
) => {
    const accepted = summarizeRefactorFileResultArray(results.accepted);
    const discarded = summarizeRefactorFileResultArray(results.discarded);

    /**
     * The algorithm is built in a way that it relies on "planFiles" to
     * return a list of files to be refactored. This means that if a file
     * was already refactored, but for some reason the refactoring produced
     * an outcome that "planFiles" wants to still refactor, the file will
     * be refactored again - which will cause an infinite loop, which will be
     * safely detected by the algorithm and the refactoring for that file will
     * be aborted.
     *
     * This will cause some "accepted" files to be duplicated in the "discarded"
     * list, which we filter out here for cleaner UX purposes - the users do not
     * see the "discarded" commits anyway.
     */
    if (opts?.filterOutDuplicatesFromDiscarded ?? true) {
        const discardedFilePaths = Object.keys(discarded.resultsByFilePaths);
        const duplicatedFilePaths = discardedFilePaths.filter(
            (filePath) => filePath in accepted.resultsByFilePaths
        );
        duplicatedFilePaths.forEach((filePath) => {
            delete discarded.resultsByFilePaths[filePath];
            delete discarded.usageByFilePaths[filePath];
        });
    }

    return {
        accepted,
        discarded,
    };
};

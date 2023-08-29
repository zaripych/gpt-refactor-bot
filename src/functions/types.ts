import { z } from 'zod';

export const functionsConfigSchema = z.object({
    /**
     * The root of the repository to use when calling the functions,
     * defaults to the return value of `findRepositoryRoot`.
     */
    repositoryRoot: z.string(),

    /**
     * List of package names and directory names to include in the analysis
     */
    scope: z.array(z.string()).optional(),

    /**
     * Name of the `tsconfig.json` file to use for the refactor, defaults
     * to `tsconfig.json`. In mono-repos scenarios this will affect the name
     * of every `tsconfig.json` file for every package.
     */
    tsconfigJsonFileName: z.string().optional().default('tsconfig.json'),

    /**
     * List of file globs to ignore when copying the repository to the
     * sandbox directory.
     *
     * This also affects `tsconfig.json` files lookup.
     *
     * When overriding this value, make sure to include the default
     * value as well: `['**\/node_modules\/**', '.env*', '.vscode\/**']`
     */
    ignore: z
        .array(z.string())
        .optional()
        .default(['**/node_modules/**', '.env*', '.vscode/**']),

    /**
     * List of globs pointing to .gitignore-style files with patterns to
     * ignore when copying the repository to the sandbox directory.
     *
     * When overriding this value, consider including the default value
     * as well: `['.gitignore']`
     */
    ignoreFiles: z.array(z.string()).optional().default(['.gitignore']),
});

export type FunctionsConfig = z.input<typeof functionsConfigSchema>;

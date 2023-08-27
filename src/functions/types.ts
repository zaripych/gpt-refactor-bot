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
});

export type FunctionsConfig = z.input<typeof functionsConfigSchema>;

import { z } from 'zod';

export const typeScriptProjectsLookupConfigSchema = z.object({
    /**
     * The root of the repository to use when looking for TypeScript projects
     */
    repositoryRoot: z.string(),

    /**
     * List of package names and directory names to include in the analysis
     */
    scope: z.array(z.string()).optional(),

    /**
     * Name of the `tsconfig.json` file to use, defaults to `tsconfig.json`. In
     * mono-repos scenarios this will affect the name of every `tsconfig.json`
     * file for every package.
     */
    tsConfigJsonFileName: z.string().optional().default('tsconfig.json'),

    /**
     * Whether to use a single ts-morph project for all packages in the monorepo
     * or separate project for each package. Combining the project helps
     * extract references across packages, but might also be more memory
     * intensive.
     */
    useCombinedTsMorphProject: z.boolean().optional().default(true),

    /**
     * List of globs to ignore when looking for TypeScript projects
     */
    ignore: z.array(z.string()).optional(),

    /**
     * List of ignore-files to use when looking for TypeScript projects
     */
    ignoreFiles: z.array(z.string()).optional(),
});

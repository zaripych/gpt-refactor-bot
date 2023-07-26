import { z } from 'zod';

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
     * Globs that represent files to be refactored, this can also be
     * automatically inferred from the goal description.
     */
    target: z.array(z.string()).optional(),

    /**
     * Maximum amount of money we can spend on a single run
     */
    budgetCents: z.number().optional().default(10_00),

    /**
     * An optional list of package.json scripts to run before the refactor starts
     */
    bootstrapScripts: z.array(z.string()).optional(),
});

export type RefactorConfig = z.infer<typeof refactorConfigSchema>;

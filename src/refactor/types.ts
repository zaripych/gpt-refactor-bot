export type RefactorConfig = {
    /**
     * Short name of the refactoring
     */
    name: string;

    /**
     * Description of the refactor
     */
    description: string;

    /**
     * GitHub repository which is the target of the refactor, could be
     * undefined if the target is current repository.
     */
    repository?: string;

    /**
     * git ref to start the refactor from, could be undefined if the
     * target is currently checked out ref.
     */
    ref?: string;

    /**
     * Globs that represent files to be refactored, this can also be
     * automatically inferred from the goal description.
     */
    target?: string[];

    /**
     * @todo
     */
    permissions?: {
        /**
         * List of files that can be read by the refactor-bot
         */
        read: string[];

        /**
         * List of files that can be written by the refactor-bot
         */
        write: string[];

        /**
         * List of functions that can be called by the refactor-bot
         */
        functions: string[];
    };
};

export type RefactorState = {
    step: 'goal-enrichment';
    config: RefactorConfig;
};

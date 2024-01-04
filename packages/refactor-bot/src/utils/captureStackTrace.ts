/**
 * Capture the stack trace and allow to enrich exceptions thrown in asynchronous
 * callbacks with additional stack information captured at the moment of the
 * call of this function
 */
export function captureStackTrace(opts?: {
    enabled?: boolean;
    remove?: number;
    limit?: number;
}) {
    const enabled = opts?.enabled ?? true;
    const remove = opts?.remove ?? 0;
    const limit = opts?.limit ?? 3;
    const stackContainer = {
        stack: '',
    };

    if (enabled) {
        Error.captureStackTrace(stackContainer);
    }

    const stackTrace = stackContainer.stack
        .split('\n')
        .slice(3 + remove, 3 + remove + limit)
        .join('\n');

    const prepareForRethrow = (err: Error) => {
        if (!enabled) {
            return err;
        }
        const oldStackTrace = (err.stack ?? '').split('\n').slice(1).join('\n');
        Object.assign(err, {
            stack: [
                oldStackTrace,
                '',
                'Originating from: ',
                '',
                stackTrace,
            ].join('\n'),
        });
        return err;
    };

    return {
        /**
         * Captured stack trace information
         */
        stackTrace,
        /**
         * Can be called in asynchronous callback to enrich exceptions with
         * additional information
         *
         * @param err Exception to enrich - it is going to have its `.stack`
         * prop mutated
         * @returns Same exception
         */
        prepareForRethrow,
    };
}

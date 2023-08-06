import { AbortError } from '../errors/abortError';
import { logger } from '../logger/logger';

export type RetryOpts = {
    maxAttempts: number;
    shouldRetry?: (err: unknown, failedAttempt: number) => Promise<boolean>;
};

export async function retry<T>(
    fn: (attempt: number) => Promise<T>,
    opts: RetryOpts
) {
    let lastError: unknown = undefined;

    for (let i = 0; i < opts.maxAttempts; i++) {
        try {
            return await fn(i + 1);
        } catch (err: unknown) {
            if (err instanceof AbortError) {
                throw err;
            }

            logger.error(err);

            lastError = err;

            if (opts.shouldRetry && !(await opts.shouldRetry(err, i + 1))) {
                throw err;
            }
        }
    }

    throw lastError;
}

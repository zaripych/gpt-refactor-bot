import { AbortError } from './abortError';

export class RateLimitExceededError extends AbortError {
    override name = 'RateLimitExceededError';

    constructor(
        message: string,
        options?: ErrorOptions & Record<string, unknown>
    ) {
        super(message, options);
    }
}

import { AbortError } from './abortError';

export class OutOfContextBoundsError extends AbortError {
    override name = 'OutOfContextBoundsError';

    constructor(
        message: string,
        options?: ErrorOptions & Record<string, unknown>
    ) {
        super(message, options);
    }
}

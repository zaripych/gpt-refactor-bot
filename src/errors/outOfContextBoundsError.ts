import { AbortError } from './abortError';

export class OutOfContextBoundsError extends AbortError {
    override name = 'OutOfContextBoundsError';

    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
    }
}

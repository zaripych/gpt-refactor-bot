import { AbortError } from './abortError';

export class ConfigurationError extends AbortError {
    override name = 'ConfigurationError';

    constructor(
        message: string,
        options?: ErrorOptions & Record<string, unknown>
    ) {
        super(message, options);
    }
}

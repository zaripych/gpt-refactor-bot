export class AbortError extends Error {
    override name = 'AbortError';

    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
    }
}

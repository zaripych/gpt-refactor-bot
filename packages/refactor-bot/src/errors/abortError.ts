export class AbortError extends Error {
    override name = 'AbortError';

    constructor(
        message: string,
        options?: ErrorOptions & Record<string, unknown>
    ) {
        super(message, options);
        Object.assign(this, options);
    }
}

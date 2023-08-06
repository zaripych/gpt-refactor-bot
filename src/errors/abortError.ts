export class AbortError extends Error {
    override name = 'AbortError';

    constructor(message: string) {
        super(message);
    }
}

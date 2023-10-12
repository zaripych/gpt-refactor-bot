import { AbortError } from './abortError';

export class CycleDetectedError extends AbortError {
    override name = 'CycleDetectedError';

    constructor(message: string, public readonly key: string) {
        super(message);
    }
}

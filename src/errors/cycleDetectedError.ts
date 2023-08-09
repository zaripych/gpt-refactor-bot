import { AbortError } from './abortError';

export class CycleDetectedError extends AbortError {
    override name = 'CycleDetectedError';

    constructor(message: string, public readonly pipelineKeyId: string) {
        super(message);
    }
}

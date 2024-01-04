import type { GptRequestErrorOpts } from './gptRequestError';
import { GptRequestError } from './gptRequestError';

export class RateLimitExceededError extends GptRequestError {
    override name = 'RateLimitExceededError';

    constructor(message: string, options?: GptRequestErrorOpts) {
        super(message, options);
    }
}

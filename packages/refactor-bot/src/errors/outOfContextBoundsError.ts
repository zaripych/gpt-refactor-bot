import type { GptRequestErrorOpts } from './gptRequestError';
import { GptRequestError } from './gptRequestError';

export class OutOfContextBoundsError extends GptRequestError {
    override name = 'OutOfContextBoundsError';

    constructor(message: string, options?: GptRequestErrorOpts) {
        super(message, options);
    }
}

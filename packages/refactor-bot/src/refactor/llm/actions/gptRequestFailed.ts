import type { Models } from '../../../chat-gpt/api';
import type { GptRequestError } from '../../../errors/gptRequestError';
import { declareAction } from '../../../event-bus';

export const gptRequestFailed = declareAction(
    'gptRequestFailed',
    (data: { model: Models; key?: string; error: GptRequestError }) => data
);

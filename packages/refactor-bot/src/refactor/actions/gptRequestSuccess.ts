import type { Models, Response } from '../../chat-gpt/api';
import { declareAction } from '../../event-bus';

export const gptRequestSuccess = declareAction(
    'gptRequestSuccess',
    (data: { model: Models; key?: string; response: Response }) => data
);

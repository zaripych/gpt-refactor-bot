import type { Opts } from '../../chat-gpt/api';
import { declareAction } from '../../event-bus';

export const gptRequestStarted = declareAction(
    'gptRequestStarted',
    (data: Omit<Opts, 'abortSignal'> & { key?: string }) => data
);

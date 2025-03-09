import type { Message } from '../../chat-gpt/api';
import { serializeMessage } from './serializeMessage';

export const serializeMessages = (messages: Message[]) =>
    messages
        .map((message, i) =>
            serializeMessage(message, {
                messages,
                index: i,
            })
        )
        .join('\n\n---\n\n');

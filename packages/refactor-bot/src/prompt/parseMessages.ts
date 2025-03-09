import type { Message } from '../chat-gpt/api';
import { deserializeMessage } from './serialization/serializeMessage';

const splitConversationFileContents = (contents: string) =>
    contents.split(/^---\s*$/gm);

export const parseMessages = (contents: string) =>
    splitConversationFileContents(contents)
        .map((message) => message.trim())
        .filter((message) => message)
        .reduce(
            (ctx, slice, index) => {
                const message = deserializeMessage(slice, {
                    ...ctx,
                    index,
                    previousRole: ctx.messages[ctx.messages.length - 1]?.role,
                });
                if (message.role === 'user' && message.content === '') {
                    return ctx;
                }
                return {
                    messages: ctx.messages.concat(message),
                };
            },
            {
                messages: [] as Message[],
            }
        ).messages;

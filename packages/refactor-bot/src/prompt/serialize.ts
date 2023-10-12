import type { Message } from '../chat-gpt/api';
import { UnreachableError } from '../utils/UnreachableError';

export const header = `> This is a conversation with a OpenAI model. You can edit this file manually to enter a new prompt and then execute \`pnpm refactor-bot prompt\` to continue the conversation.

> Messages are separated by a \`---\`. The application is going to automatically add \`> @role [user|assistant|system]\` to the messages depending on their order. Feel free to modify the comment to change the role of a message. All quotes are considered comments.

`;

export const serializeMessages = (messages: Message[]) =>
    header +
    messages
        .map((message) => {
            switch (message.role) {
                case 'system':
                    return `> @role system\n\n${message.content}`;
                case 'user':
                    return `> @role user\n\n${message.content}`;
                case 'assistant': {
                    if ('functionCall' in message) {
                        return `> @role assistant\n\n\`\`\`json\n${JSON.stringify(
                            message.functionCall
                        )}\n\`\`\`\n`;
                    }
                    return `> @role assistant\n\n${message.content}`;
                }
                case 'function': {
                    if (!message.name) {
                        throw new Error('Message name is missing');
                    }
                    return `> @role function\n\n> @function ${message.name}\n\n\`\`\`json\n${message.content}\n\`\`\`\n`;
                }
                default:
                    throw new UnreachableError(message);
            }
        })
        .join('\n\n---\n\n');

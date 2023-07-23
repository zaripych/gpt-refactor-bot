import type { Message } from '../chat-gpt/api';
import { prettierMarkdown } from '../prettier/prettier';
import { UnreachableError } from '../utils/UnreachableError';

export const header = `> This is a conversation with a OpenAI model. You can edit this file manually to enter a new prompt and then execute \`pnpm refactor-bot prompt\` to continue the conversation.

> Messages are separated by a \`---\`. The first message has a role \`system\`, followed by a message that has role \`user\`. Following that, all other even indexed messages have the same \`user\` role, while odd numbered ones have role \`assistant\` and represent a reply from the bot. The application is going to automatically add \`> @role [user|assistant|system]\` to the messages depending on what the previous message role was. All quotes are considered comments as they are easy to remove from messages.

`;

export const serializeMessages = async (messages: Message[]) =>
    prettierMarkdown(
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
                            return `> @role function\n> @function ${message.name}\n\n\`\`\`json\n${message.content}\n\`\`\`\n`;
                        }
                        default:
                            throw new UnreachableError(message);
                    }
                })
                .join('\n\n---\n\n')
    );

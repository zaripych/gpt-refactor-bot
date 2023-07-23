import type { Message } from '../chat-gpt/api';
import { print } from '../markdown/markdown';
import { UnreachableError } from '../utils/UnreachableError';

const json = (obj: unknown) =>
    `\`\`\`json\n${JSON.stringify(obj, undefined, '  ')}\n\`\`\``;

export const formatMessage = (message: Message, prefixDivider?: boolean) => {
    const prefix = prefixDivider ? '---\n\n' : '';
    switch (message.role) {
        case 'system':
        case 'user':
            return prefix + message.content;
        case 'assistant':
            if ('functionCall' in message) {
                let args: unknown;
                try {
                    args = JSON.parse(message.functionCall.arguments);
                } catch (err) {
                    args = message.functionCall.arguments;
                }
                return (
                    prefix +
                    json({
                        name: message.functionCall.name,
                        arguments: args,
                    })
                );
            }
            return prefix + message.content;

        case 'function':
            try {
                return prefix + json(JSON.parse(message.content));
            } catch (err) {
                console.log(err);
                console.log(`Cannot parse as JSON: \n${message.content}`);
                throw err;
            }
        default:
            throw new UnreachableError(message);
    }
};

export const printMessage = async (
    message: Message,
    prefixDivider?: boolean
) => {
    await print(formatMessage(message, prefixDivider));
};

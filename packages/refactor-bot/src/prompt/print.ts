import type { Message } from '../chat-gpt/api';
import { logger } from '../logger/logger';
import { markdown, printMarkdown } from '../markdown/markdown';
import { format } from '../text/format';
import { UnreachableError } from '../utils/UnreachableError';

const json = (obj: unknown) =>
    format(
        markdown`
            ~~~json
            %json%
            ~~~
        `,
        { json: JSON.stringify(obj, undefined, '  ') }
    );

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
                logger.error('Cannot parse as JSON', err, {
                    content: message.content,
                });
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
    await printMarkdown(formatMessage(message, prefixDivider));
};

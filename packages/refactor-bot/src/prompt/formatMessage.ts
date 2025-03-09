import type { Message } from '../chat-gpt/api';
import { printMarkdown } from '../markdown/markdown';
import { serializeMessage } from './serialization/serializeMessage';

export const formatMessage = (message: Message, prefixDivider?: boolean) => {
    const prefix = prefixDivider ? '---\n\n' : '';
    return [prefix, serializeMessage(message)].join('\n');
};

export const printMessage = async (opts: {
    message: Message;
    prefixDivider?: boolean;
}) => {
    await printMarkdown(formatMessage(opts.message, opts.prefixDivider));
};

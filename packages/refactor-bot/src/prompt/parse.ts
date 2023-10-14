import { z } from 'zod';

import type { FunctionCallMessage, MessageRole } from '../chat-gpt/api';

const parseRole = (message: string): MessageRole | 'function' | undefined => {
    const match = message.match(/> @role (system|user|assistant|function)/);
    if (match) {
        return match[1] as MessageRole | 'function';
    }
    return undefined;
};

const guessRole = (
    parsedRole: MessageRole | 'function' | undefined,
    previousRole: MessageRole | 'function' | undefined,
    index: number
): MessageRole | 'function' => {
    if (parsedRole) {
        return parsedRole;
    }
    if (previousRole === 'system') {
        return 'user';
    }
    if (previousRole === 'assistant') {
        return 'user';
    }
    if (previousRole === 'user') {
        return 'assistant';
    }
    if (previousRole === 'function') {
        return 'assistant';
    }
    const result = (['user', 'assistant'] as const)[index % 2];
    return result as NonNullable<typeof result>;
};

const parseFunctionCall = (
    message: string
): { name: string; arguments: string } | undefined => {
    try {
        const result = JSON.parse(message) as unknown;
        const validation = z
            .object({
                name: z.string(),
                arguments: z.string(),
            })
            .safeParse(result);

        if (validation.success) {
            return validation.data;
        }

        return undefined;
    } catch (err) {
        return undefined;
    }
};

const parseFunctionName = (message: string): string => {
    const match = /^> @function \s*(.+)\s*/gm.exec(message);
    if (match) {
        return match[1] as string;
    }
    return '';
};

const removeComments = (message: string) =>
    message.replaceAll(/^>.*$/gm, '').trim();

const removeBackticks = (message: string) =>
    message.replaceAll(/^((```+)|(~~~+))\w*$/gm, '').trim();

const splitConversationFileContents = (contents: string) =>
    contents.split(/^---\s*$/gm);

export const parseMessages = (contents: string) =>
    splitConversationFileContents(contents)
        .map((message) => message.trim())
        .filter((message) => message)
        .map((message) => ({
            parsedRole: parseRole(message),
            message,
        }))
        .map(({ message, parsedRole }, i, arr) => ({
            role: guessRole(
                parsedRole,
                i > 0 ? arr[i - 1]?.parsedRole : undefined,
                i
            ),
            functionName: parseFunctionName(message),
            content: removeComments(message),
            functionCall: parseFunctionCall(
                removeBackticks(removeComments(message))
            ),
        }))
        .filter((message) => message.content)
        .map((message) => {
            if (
                message.role === 'assistant' &&
                'functionCall' in message &&
                message.functionCall
            ) {
                return {
                    role: 'assistant' as const,
                    functionCall: message.functionCall,
                } satisfies FunctionCallMessage;
            }
            if (message.role === 'function') {
                return {
                    role: message.role,
                    name: message.functionName,
                    content: removeBackticks(message.content),
                };
            }
            return {
                role: message.role,
                content: message.content,
            };
        });

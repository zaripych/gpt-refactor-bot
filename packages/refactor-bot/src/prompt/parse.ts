import { z } from 'zod';

import type { FunctionCallMessage, MessageRole } from '../chat-gpt/api';

const parseRole = (message: string): MessageRole | 'function' | undefined => {
    const match = message.match(
        /(^>)?\s*@role (system|user|assistant|function)/
    );
    if (match) {
        return match[2] as MessageRole | 'function';
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

const parseFunctionCall = (opts: {
    functionName?: string;
    message: string;
}): { name: string; arguments: string } | undefined => {
    try {
        const nameArgsPair = z
            .string()
            .transform((text) => JSON.parse(text) as unknown)
            .pipe(
                z.object({
                    name: z.string(),
                    arguments: z.string(),
                })
            )
            .safeParse(opts.message);

        if (nameArgsPair.success) {
            return nameArgsPair.data;
        }

        if (opts.functionName) {
            const justArgs = z
                .string()
                .transform((text) => JSON.parse(text) as unknown)
                .pipe(z.object({}).passthrough())
                .safeParse(opts.message);

            if (justArgs.success) {
                return {
                    name: opts.functionName,
                    arguments: JSON.stringify(justArgs.data),
                };
            }
        }

        return undefined;
    } catch (err) {
        return undefined;
    }
};

const parseSpecialFunctionCall = (opts: {
    role?: string;
    functionName?: string;
    message: string;
}): { name: string; arguments: string } | undefined => {
    if (opts.functionName === 'runTsMorphScript' && opts.role === 'assistant') {
        return {
            name: opts.functionName,
            arguments: JSON.stringify(
                {
                    code: removeBackticks(removeComments(opts.message)),
                },
                null,
                2
            ),
        };
    } else if (opts.role === 'assistant') {
        return parseFunctionCall({
            functionName: opts.functionName,
            message: removeBackticks(removeComments(opts.message)),
        });
    } else {
        return undefined;
    }
};

const parseFunctionName = (message: string): string => {
    const match = /(^>)?\s*@function \s*(.+)\s*/gm.exec(message);
    if (match) {
        return match[2] as string;
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
        .map(({ message, parsedRole }, i, arr) => {
            const functionName = parseFunctionName(message);
            const role = guessRole(
                parsedRole,
                i > 0 ? arr[i - 1]?.parsedRole : undefined,
                i
            );
            return {
                role,
                functionName,
                content: removeComments(message),
                functionCall: parseSpecialFunctionCall({
                    role,
                    functionName,
                    message,
                }),
            };
        })
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

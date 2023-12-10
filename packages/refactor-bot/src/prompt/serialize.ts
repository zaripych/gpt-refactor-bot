import { z } from 'zod';

import type { Message } from '../chat-gpt/api';
import { markdown } from '../markdown/markdown';
import { format } from '../text/format';
import { UnreachableError } from '../utils/UnreachableError';

export const header = `> This is a conversation with a OpenAI model. You can edit this file manually to enter a new prompt and then execute \`pnpm refactor-bot prompt\` to continue the conversation.

> Messages are separated by a \`---\`. The application is going to automatically add \`> @role [user|assistant|system]\` to the messages depending on their order. Feel free to modify the comment to change the role of a message. All quotes are considered comments.

`;

const serializeAnyMessage = (message: {
    role: 'function' | 'assistant' | 'user' | 'system';
    content: string;
}) => {
    return format(
        markdown`
            > @role %role%

            %content%
        `,
        message
    );
};

const serializeSpecialFunctionCall = (functionCall: {
    name: string;
    arguments: string;
}) => {
    switch (functionCall.name) {
        case 'runTsMorphScript': {
            const result = z
                .string()
                .transform((text) => JSON.parse(text) as unknown)
                .pipe(
                    z
                        .object({
                            code: z.string(),
                        })
                        .passthrough()
                )
                .safeParse(functionCall.arguments);

            if (result.success && Object.keys(result.data).length === 1) {
                return format(
                    markdown`
                        > @role assistant @function %name%

                        ~~~ts
                        %code%
                        ~~~
                    `,
                    {
                        name: functionCall.name,
                        code: result.data.code,
                    }
                );
            }

            return undefined;
        }
        default:
            return undefined;
    }
};

const serializeFunctionCall = (functionCall: {
    name: string;
    arguments: string;
}) => {
    const special = serializeSpecialFunctionCall(functionCall);
    if (special) {
        return special;
    }

    return format(
        markdown`
            > @role assistant @function %name%

            ~~~json
            %json%
            ~~~
        `,
        {
            name: functionCall.name,
            json: functionCall.arguments,
        }
    );
};

const serializeFunctionResult = (message: {
    role: 'function';
    name: string;
    content: string;
}) => {
    return format(
        markdown`
            > @role function @function %name%

            ~~~json
            %content%
            ~~~
        `,
        message
    );
};

export const serializeMessages = (messages: Message[]) =>
    header +
    messages
        .map((message) => {
            switch (message.role) {
                case 'system':
                    return serializeAnyMessage(message);
                case 'user':
                    return serializeAnyMessage(message);
                case 'assistant': {
                    if ('functionCall' in message) {
                        return serializeFunctionCall(message.functionCall);
                    }
                    return serializeAnyMessage(message);
                }
                case 'function': {
                    if (!message.name) {
                        throw new Error('Message name is missing');
                    }
                    return serializeFunctionResult(message);
                }
                default:
                    throw new UnreachableError(message);
            }
        })
        .join('\n\n---\n\n');

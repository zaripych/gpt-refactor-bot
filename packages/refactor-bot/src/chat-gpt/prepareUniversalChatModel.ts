import {
    AIMessage,
    type MessageFieldWithRole,
    ToolMessage,
} from '@langchain/core/messages';
import { initChatModel } from 'langchain/chat_models/universal';
import { z } from 'zod';

import { ensureTruthy } from '../utils/isTruthy';
import { UnreachableError } from '../utils/UnreachableError';
import type {
    Opts,
    RegularAssistantMessage,
    Response,
    ToolCallsMessage,
} from './api';

export const inputSchema = z.object({
    model: z.string().nonempty(),
    modelOptions: z.record(z.unknown()).optional(),
});

function convertToLangchainMessages(messages: Opts['messages']) {
    return messages.map((message, i) => {
        switch (message.role) {
            case 'function':
                throw new Error('Function calls are not supported');
            case 'assistant': {
                if ('functionCall' in message) {
                    throw new Error(
                        'Function calls are not supported, use toolCalls instead'
                    );
                }
                if ('toolCalls' in message) {
                    return new AIMessage({
                        content: '',
                        tool_calls: message.toolCalls.map((toolCall) => ({
                            id: toolCall.id,
                            args: JSON.parse(
                                toolCall.function.arguments
                            ) as Record<string, unknown>,
                            name: toolCall.function.name,
                        })),
                    });
                }
                return new AIMessage({
                    content: message.content,
                });
            }
            case 'tool': {
                return new ToolMessage({
                    content: message.content,
                    tool_call_id: message.toolCallId,
                });
            }
            case 'system':
            case 'user':
                if (i !== 0 && message.role === 'system') {
                    return {
                        ...message,
                        role: 'user',
                    } as MessageFieldWithRole;
                }
                return message as MessageFieldWithRole;
            default:
                throw new UnreachableError(message);
        }
    });
}

function convertFromLangchainMessages(message: AIMessage) {
    switch (message.getType()) {
        case 'ai':
            if (message.tool_calls && message.tool_calls.length > 0) {
                return {
                    role: 'assistant',
                    toolCalls: message.tool_calls.map((toolCall) => ({
                        id: ensureTruthy(toolCall.id),
                        type: 'function',
                        function: {
                            name: toolCall.name,
                            arguments: JSON.stringify(toolCall.args),
                        },
                    })),
                } satisfies ToolCallsMessage;
            }
            return {
                role: 'assistant',
                content:
                    typeof message.content === 'string'
                        ? message.content
                        : message.content
                              .map((c) => {
                                  if (c.type === 'text') {
                                      return c.text as string;
                                  }
                                  if (c.type === 'image_url') {
                                      return c.image_url as string;
                                  }
                                  return JSON.stringify(c);
                              })
                              .join('\n'),
            } satisfies RegularAssistantMessage;
        default:
            throw new Error(`Unsupported message type: ${message.getType()}`);
    }
}

export function prepareUniversalChatModel() {
    const chatCompletions = async (opts: Opts): Promise<Response> => {
        const params = inputSchema.parse(opts);
        const universalClient = await initChatModel(
            params.model,
            params.modelOptions
        );

        const result = await universalClient.invoke(
            convertToLangchainMessages(opts.messages),
            {
                signal: opts.abortSignal,
                tools: opts.tools?.map((tool) => ({
                    type: 'function',
                    function: tool,
                })),
            }
        );

        return {
            usage: {
                completionTokens: result.usage_metadata?.output_tokens ?? 0,
                promptTokens: result.usage_metadata?.input_tokens ?? 0,
                totalTokens: result.usage_metadata?.total_tokens ?? 0,
            },
            choices: [
                (result.tool_calls?.length ?? 0) > 0
                    ? {
                          index: 0,
                          finishReason: 'tool_calls',
                          message: convertFromLangchainMessages(
                              result
                          ) as ToolCallsMessage,
                      }
                    : {
                          index: 0,
                          finishReason: 'stop',
                          message: convertFromLangchainMessages(
                              result
                          ) as RegularAssistantMessage,
                      },
            ],
        };
    };

    return {
        chatCompletions,
    };
}

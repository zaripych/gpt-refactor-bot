import { z } from 'zod';
import type zodToJsonSchema from 'zod-to-json-schema';

import {
    GptRequestError,
    type GptResponseInfo,
} from '../errors/gptRequestError';
import { OutOfContextBoundsError } from '../errors/outOfContextBoundsError';
import { RateLimitExceededError } from '../errors/rateLimitExceeded';
import { logger } from '../logger/logger';
import { ensureHasOneElement } from '../utils/hasOne';
import { adaptO1RequestBody, adaptO1Response } from './adapters/o1';
import type {
    BodyShape,
    MessageShape,
    ResponseMessageShape,
    ResponseShape,
} from './internalTypes';

export const modelsSchema = z.union([
    z.string(),
    z
        .enum([
            'o1',
            'o1-mini',
            'o1-preview',
            'gpt-4o-realtime-preview',
            'gpt-4o',
            'gpt-4o-mini',
            'gpt-4-turbo',
            'gpt-4-turbo-preview',
            'gpt-4-0125-preview',
            'gpt-4-1106-preview',
            'gpt-4-1106-vision-preview',
            'gpt-4',
            'gpt-4-0613',
            'gpt-4-32k',
            'gpt-4-32k-0613',
            'gpt-3.5-turbo-1106',
            'gpt-3.5-turbo',
            'gpt-3.5-turbo-0613',
            'gpt-3.5-turbo-16k',
            'gpt-3.5-turbo-16k-0613',
        ])
        .brand('gpt-model'),
]);

export type Models = z.infer<typeof modelsSchema>;

export const messageRoleSchema = z.enum(['user', 'system', 'assistant']);

export const systemMessageSchema = z.object({
    role: z.literal('system'),
    content: z.string(),
});

export const regularMessageSchema = z.object({
    role: messageRoleSchema,
    content: z.string(),
});

export type RegularMessage = z.infer<typeof regularMessageSchema>;

export const regularAssistantMessageSchema = z.object({
    role: z.literal('assistant'),
    content: z.string(),
});

export type RegularAssistantMessage = z.infer<
    typeof regularAssistantMessageSchema
>;

export const functionCallMessageSchema = z.object({
    role: z.literal('assistant'),
    functionCall: z.object({
        name: z.string(),
        arguments: z.string(),
    }),
});

export type FunctionCallMessage = z.infer<typeof functionCallMessageSchema>;

export const toolCallsMessageSchema = z.object({
    role: z.literal('assistant'),
    toolCalls: z.array(
        z.object({
            id: z.string(),
            type: z.literal('function'),
            function: z.object({
                name: z.string(),
                arguments: z.string(),
            }),
        })
    ),
});

export type ToolCallsMessage = z.infer<typeof toolCallsMessageSchema>;

export const responseMessageSchema = z.union([
    functionCallMessageSchema,
    toolCallsMessageSchema,
    regularAssistantMessageSchema,
]);

export type ResponseMessage = z.infer<typeof responseMessageSchema>;

export const functionCallResultMessageSchema = z.object({
    role: z.literal('function'),
    name: z.string(),
    content: z.string(),
});

export type FunctionCallResultMessage = z.infer<
    typeof functionCallResultMessageSchema
>;

export const toolCallResultMessageSchema = z.object({
    role: z.literal('tool'),
    toolCallId: z.string(),
    content: z.string(),
});

export type ToolCallResultMessage = z.infer<typeof toolCallResultMessageSchema>;

export const messageSchema = z.union([
    regularMessageSchema,
    functionCallMessageSchema,
    functionCallResultMessageSchema,
    toolCallsMessageSchema,
    toolCallResultMessageSchema,
]);

export type Message = z.infer<typeof messageSchema>;

export type MessageRole = z.infer<typeof messageRoleSchema>;

export const functionDescriptionSchema = z.object({
    name: z.string(),
    description: z.string().optional(),
    parameters: z
        .object({})
        .passthrough()
        .optional()
        .refine((value) => value as ReturnType<typeof zodToJsonSchema>),
});

export type FunctionDescription = z.infer<typeof functionDescriptionSchema>;

export type Opts = {
    model?: Models;
    messages: Array<Message>;
    functions?: Array<FunctionDescription>;
    tools?: Array<FunctionDescription>;
    functionCall?: 'none' | 'auto' | { name: string };
    maxTokens?: number;
    // between zero to two, defaults to one
    temperature: number;
    choices?: number;
    abortSignal?: AbortSignal;
};

export const responseSchema = z.object({
    choices: z
        .array(
            z.union([
                z.object({
                    index: z.number(),
                    message: toolCallsMessageSchema,
                    finishReason: z.literal('tool_calls'),
                }),
                z.object({
                    index: z.number(),
                    message: functionCallMessageSchema,
                    finishReason: z.literal('function_call'),
                }),
                z.object({
                    index: z.number(),
                    message: regularAssistantMessageSchema,
                    finishReason: z.enum(['stop', 'length']),
                }),
            ])
        )
        .nonempty(),
    usage: z.object({
        promptTokens: z.number(),
        completionTokens: z.number(),
        totalTokens: z.number(),
    }),
});

export type Response = z.infer<typeof responseSchema>;

const errorResponseShape = z
    .object({
        error: z
            .object({
                message: z.string().optional(),
                type: z.string().nullable().optional(),
                param: z.string().nullable().optional(),
                code: z
                    .string()
                    .nullable()
                    .optional()
                    .transform(
                        (code) =>
                            code as
                                | 'context_length_exceeded'
                                | 'rate_limit_exceeded'
                                | (string & {
                                      _brand?: 'unknown';
                                  })
                    ),
            })
            .passthrough(),
    })
    .passthrough();

export type ErrorResponse = z.infer<typeof errorResponseShape>;

const messageToInternal = (message: Message): MessageShape => {
    if ('functionCall' in message) {
        return {
            role: 'assistant' as const,
            content: null,
            function_call: {
                name: message.functionCall.name,
                arguments: message.functionCall.arguments,
            },
        };
    }

    if ('toolCalls' in message) {
        return {
            role: 'assistant' as const,
            content: null,
            function_call: null,
            tool_calls: message.toolCalls.map((toolCall) => ({
                id: toolCall.id,
                type: 'function' as const,
                function: {
                    name: toolCall.function.name,
                    arguments: toolCall.function.arguments,
                },
            })),
        };
    }

    if ('toolCallId' in message) {
        return {
            role: 'tool' as const,
            tool_call_id: message.toolCallId,
            content: message.content,
        };
    }

    return message;
};

const messageFromInternal = (
    message: ResponseMessageShape
): ResponseMessage => {
    if ('function_call' in message && message.function_call) {
        return {
            role: 'assistant' as const,
            functionCall: {
                name: message.function_call.name,
                arguments: message.function_call.arguments,
            },
        };
    }

    if ('tool_calls' in message) {
        return {
            role: 'assistant' as const,
            toolCalls: message.tool_calls.map((toolCall) => ({
                id: toolCall.id,
                type: 'function' as const,
                function: {
                    name: toolCall.function.name,
                    arguments: toolCall.function.arguments,
                },
            })),
        };
    }

    return message;
};

export async function chatCompletions(opts: Opts): Promise<Response> {
    const model: Models = opts.model || 'gpt-4o';
    const apiToken = process.env['OPENAI_API_KEY'];
    if (!apiToken) {
        throw new Error(`OPENAI_API_KEY environment variable is not set`);
    }

    const applyO1Workarounds = model.startsWith('o1-');

    let body: BodyShape = {
        model,
        messages: opts.messages.map(messageToInternal),
        ...(opts.functions &&
            opts.functions.length > 0 && {
                functions: opts.functions,
            }),
        ...(opts.tools &&
            opts.tools.length > 0 && {
                tools: opts.tools.map((tool) => ({
                    type: 'function',
                    function: tool,
                })),
            }),
        ...(opts.functionCall && {
            function_call: opts.functionCall,
        }),
        ...(typeof opts.maxTokens === 'number' && {
            max_tokens: opts.maxTokens,
        }),
        ...(typeof opts.temperature === 'number' && {
            temperature: opts.temperature,
        }),
        ...(typeof opts.choices === 'number' && {
            n: opts.choices,
        }),
    };

    if (applyO1Workarounds) {
        body = {
            ...body,
            ...adaptO1RequestBody(opts),
        };
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiToken}`,
        },
        body: JSON.stringify(body),
        signal: opts.abortSignal,
    }).catch((err) => {
        throw new GptRequestError(
            `Failed to fetch OpenAI chat completions API`,
            {
                cause: err,
            }
        );
    });

    if (!response.ok) {
        const info: Omit<GptResponseInfo, 'text' | 'json'> = {
            url: response.url,
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries()),
        };

        const contentType = response.headers.get('content-type');
        if (
            contentType === 'application/json' ||
            contentType?.includes('application/json')
        ) {
            const raw = await response.json();
            const result = errorResponseShape.safeParse(raw);
            if (result.success) {
                const jsonInfo = {
                    ...info,
                    json: result.data,
                };
                switch (result.data.error.code) {
                    case 'context_length_exceeded':
                        throw new OutOfContextBoundsError(
                            result.data.error.message ??
                                'Out of context bounds',
                            {
                                model,
                                response: jsonInfo,
                            }
                        );
                    case 'rate_limit_exceeded':
                        throw new RateLimitExceededError(
                            result.data.error.message ?? 'Rate limit exceeded',
                            {
                                model,
                                response: jsonInfo,
                            }
                        );
                    default:
                        throw new GptRequestError(
                            `Unknown OpenAI API error: ${result.data.error.code}`,
                            {
                                model,
                                response: jsonInfo,
                            }
                        );
                }
            } else {
                logger.error('Failed to parse GPT error response', {
                    error: result.error,
                    response: raw,
                });
            }
        }

        const text = await response.text().catch(() => '');
        throw new GptRequestError(
            `Failed to fetch chat completions: ${response.statusText}`,
            {
                model,
                response: {
                    ...info,
                    text,
                },
            }
        );
    }

    const data = (await response.json().catch((err) => {
        throw new GptRequestError(
            `Failed to fetch OpenAI chat completions response as JSON`,
            {
                model,
                cause: err,
            }
        );
    })) as ResponseShape;

    let finalResponse: Response = {
        usage: {
            completionTokens: data.usage.completion_tokens,
            promptTokens: data.usage.prompt_tokens,
            totalTokens: data.usage.total_tokens,
        },
        choices: ensureHasOneElement(
            data.choices.map((choice) => {
                switch (choice.finish_reason) {
                    case 'function_call':
                        return {
                            finishReason: choice.finish_reason,
                            index: choice.index,
                            message: messageFromInternal(
                                choice.message
                            ) as FunctionCallMessage,
                        };
                    case 'tool_calls':
                        return {
                            finishReason: choice.finish_reason,
                            index: choice.index,
                            message: messageFromInternal(
                                choice.message
                            ) as ToolCallsMessage,
                        };
                    default: {
                        return {
                            finishReason: choice.finish_reason,
                            index: choice.index,
                            message: messageFromInternal(
                                choice.message
                            ) as RegularAssistantMessage,
                        };
                    }
                }
            })
        ),
    };

    if (applyO1Workarounds) {
        finalResponse = {
            ...finalResponse,
            ...adaptO1Response(finalResponse),
        };
    }

    return {
        ...finalResponse,
        choices: finalResponse.choices,
    };
}

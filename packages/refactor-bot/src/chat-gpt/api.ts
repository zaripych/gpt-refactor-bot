import { z } from 'zod';
import type zodToJsonSchema from 'zod-to-json-schema';

import {
    GptRequestError,
    type GptResponseInfo,
} from '../errors/gptRequestError';
import { OutOfContextBoundsError } from '../errors/outOfContextBoundsError';
import { RateLimitExceededError } from '../errors/rateLimitExceeded';
import { ensureHasOneElement } from '../utils/hasOne';
import type {
    BodyShape,
    MessageShape,
    ResponseMessageShape,
    ResponseShape,
} from './internalTypes';

export const modelsSchema = z.enum([
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

export const responseMessageSchema = z.union([
    functionCallMessageSchema,
    regularAssistantMessageSchema,
]);

export type ResponseMessage = z.infer<typeof responseMessageSchema>;

export const functionResultMessageSchema = z.object({
    role: z.literal('function'),
    name: z.string(),
    content: z.string(),
});

export type FunctionResultMessage = z.infer<typeof functionResultMessageSchema>;

export const messageSchema = z.union([
    regularMessageSchema,
    functionCallMessageSchema,
    functionResultMessageSchema,
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
    functionCall?: 'none' | 'auto' | { name: string };
    maxTokens?: number;
    // between zero to two, defaults to one
    temperature: number;
    choices?: number;
    abortSignal?: AbortSignal;
};

export const responseSchema = z.object({
    id: z.string(),
    object: z.literal('chat.completion'),
    created: z.number(),
    choices: z
        .array(
            z.union([
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
                type: z.string().optional(),
                param: z.string().optional(),
                code: z.string().transform(
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

const messageToInternal = (message: Message): MessageShape =>
    'functionCall' in message
        ? ({
              role: 'assistant',
              content: null,
              function_call: {
                  name: message.functionCall.name,
                  arguments: message.functionCall.arguments,
              },
          } as unknown as MessageShape)
        : message;

const messageFromInternal = (message: ResponseMessageShape): ResponseMessage =>
    'function_call' in message
        ? {
              role: 'assistant',
              functionCall: {
                  name: message.function_call.name,
                  arguments: message.function_call.arguments,
              },
          }
        : message;

const pricing = {
    'gpt-4-turbo-preview': {
        perKTokenInput: 0.01,
        perKTokenOutput: 0.03,
    },
    'gpt-4-0125-preview': {
        perKTokenInput: 0.01,
        perKTokenOutput: 0.03,
    },
    'gpt-4-1106-preview': {
        perKTokenInput: 0.01,
        perKTokenOutput: 0.03,
    },
    'gpt-4-1106-vision-preview': {
        perKTokenInput: 0.01,
        perKTokenOutput: 0.03,
    },
    'gpt-4': {
        perKTokenInput: 0.03,
        perKTokenOutput: 0.06,
    },
    'gpt-4-32k': {
        perKTokenInput: 0.06,
        perKTokenOutput: 0.12,
    },
    'gpt-3.5-turbo': {
        perKTokenInput: 0.001,
        perKTokenOutput: 0.002,
    },
    'gpt-3.5-turbo-16k': {
        perKTokenInput: 0.003,
        perKTokenOutput: 0.004,
    },
} satisfies Partial<
    Record<Models, { perKTokenInput: number; perKTokenOutput: number }>
>;

export function estimatePrice(
    opts: Pick<Opts, 'functions' | 'messages' | 'model'>
): number {
    const inputTokens = opts.messages.reduce(
        (acc, message) => acc + JSON.stringify(message).length,
        0
    );

    const model = opts.model || 'gpt-3.5-turbo-0613';

    const pricingModels = Object.keys(pricing);
    const matchingPricingModel = pricingModels.find((pricingModel) =>
        model.startsWith(pricingModel)
    );

    if (!matchingPricingModel) {
        throw new Error(`Unknown model ${model}`);
    }

    const price = pricing[matchingPricingModel as keyof typeof pricing] as
        | {
              perKTokenInput: number;
              perKTokenOutput: number;
          }
        | undefined;

    if (!price) {
        throw new Error(`Unknown model ${model}`);
    }

    return (inputTokens / 1000) * price.perKTokenInput;
}

export function calculatePrice(
    opts: Pick<Response, 'usage'> & {
        model: string;
    }
) {
    const model = opts.model;

    const pricingModels = Object.keys(pricing);

    const matchingPricingModel = pricingModels.find((pricingModel) =>
        model.startsWith(pricingModel)
    );

    if (!matchingPricingModel) {
        throw new Error(`Unknown model ${model}`);
    }

    const price = pricing[matchingPricingModel as keyof typeof pricing] as
        | {
              perKTokenInput: number;
              perKTokenOutput: number;
          }
        | undefined;

    if (!price) {
        throw new Error(`Unknown model ${model}`);
    }

    const promptPrice = (opts.usage.promptTokens / 1000) * price.perKTokenInput;
    const completionPrice =
        (opts.usage.completionTokens / 1000) * price.perKTokenInput;

    return {
        totalPrice: promptPrice + completionPrice,
        promptPrice,
        completionPrice,
    };
}

export async function chatCompletions(opts: Opts): Promise<Response> {
    const model = opts.model || 'gpt-3.5-turbo-0613';
    const apiToken = process.env['OPENAI_API_KEY'];
    if (!apiToken) {
        throw new Error(`OPENAI_API_KEY environment variable is not set`);
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiToken}`,
        },
        body: JSON.stringify({
            model,
            messages: opts.messages.map(messageToInternal),
            ...(opts.functions &&
                opts.functions.length > 0 && {
                    functions: opts.functions,
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
        } satisfies BodyShape),
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
        if (
            response.headers.get('content-type')?.startsWith('application/json')
        ) {
            const result = errorResponseShape.safeParse(await response.json());
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

    return {
        id: data.id,
        object: data.object,
        created: data.created,
        choices: ensureHasOneElement(
            data.choices.map((choice) =>
                choice.finish_reason === 'function_call'
                    ? {
                          finishReason: choice.finish_reason,
                          index: choice.index,
                          message: messageFromInternal(
                              choice.message
                          ) as FunctionCallMessage,
                      }
                    : {
                          finishReason: choice.finish_reason,
                          index: choice.index,
                          message: messageFromInternal(
                              choice.message
                          ) as RegularAssistantMessage,
                      }
            )
        ),
        usage: {
            completionTokens: data.usage.completion_tokens,
            promptTokens: data.usage.prompt_tokens,
            totalTokens: data.usage.total_tokens,
        },
    };
}

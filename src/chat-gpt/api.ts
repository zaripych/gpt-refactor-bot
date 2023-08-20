import { z } from 'zod';
import type zodToJsonSchema from 'zod-to-json-schema';

import { ensureHasOneElement } from '../utils/hasOne';
import type {
    BodyShape,
    MessageShape,
    ResponseMessageShape,
    ResponseShape,
} from './internalTypes';

export const modelsSchema = z.enum([
    'gpt-4',
    'gpt-4-0613',
    'gpt-4-32k',
    'gpt-4-32k-0613',
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

export const functionDefinitionSchema = z.object({
    name: z.string(),
    description: z.string().optional(),
    parameters: z
        .object({})
        .passthrough()
        .optional()
        .refine((value) => value as ReturnType<typeof zodToJsonSchema>),
});

export type FunctionDefinition = z.infer<typeof functionDefinitionSchema>;

export type Opts = {
    model?: Models;
    messages: Array<Message>;
    functions?: Array<FunctionDefinition>;
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
    'gpt-4': {
        perKTokenInput: 0.03,
        perKTokenOutput: 0.06,
    },
    'gpt-4-32k': {
        perKTokenInput: 0.06,
        perKTokenOutput: 0.12,
    },
    'gpt-3.5-turbo': {
        perKTokenInput: 0.0015,
        perKTokenOutput: 0.002,
    },
    'gpt-3.5-turbo-16k': {
        perKTokenInput: 0.003,
        perKTokenOutput: 0.004,
    },
} satisfies Partial<
    Record<Models, { perKTokenInput: number; perKTokenOutput: number }>
>;

export function estimatePriceCents(
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

    return ((inputTokens / 1000) * price.perKTokenInput) / 100;
}

export function calculatePriceCents(
    opts: Response & {
        model: Models;
    }
): number {
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

    const total =
        (opts.usage.promptTokens / 1000) * price.perKTokenInput +
        (opts.usage.completionTokens / 1000) * price.perKTokenInput;

    return total / 100;
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
            ...(opts.functions && {
                functions: opts.functions,
            }),
            ...(opts.functionCall && {
                function_call: opts.functionCall,
            }),
            ...(opts.maxTokens && {
                max_tokens: opts.maxTokens,
            }),
            ...(opts.temperature && {
                temperature: opts.temperature,
            }),
            ...(opts.choices && {
                n: opts.choices,
            }),
        } satisfies BodyShape),
        signal: opts.abortSignal,
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(
            `Failed to fetch chat completions: ${response.statusText}\n${text}`
        );
    }

    const data = (await response.json()) as ResponseShape;

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

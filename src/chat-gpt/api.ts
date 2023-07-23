import type {
    BodyShape,
    FunctionDefinitionShape,
    FunctionResponseMessageShape,
    MessageShape,
    Models as InternalModels,
    RegularMessageShape,
    ResponseShape,
} from './internalTypes';

export type Models = InternalModels;

export type RegularMessage = RegularMessageShape;

export type FunctionCallMessage = {
    role: 'assistant';
    functionCall: {
        name: string;
        arguments: string;
    };
};

export type FunctionResponseMessage = FunctionResponseMessageShape;

export type Message =
    | RegularMessage
    | FunctionCallMessage
    | FunctionResponseMessage;

export type MessageRole = Message['role'];

export type FunctionDefinition = FunctionDefinitionShape;

export type Opts = {
    model?: Models;
    messages: Array<Message>;
    functions?: Array<FunctionDefinition>;
    functionCall?: 'none' | 'auto' | { name: string };
    maxTokens?: number;
    // between zero to two, defaults to one
    temperature?: number;
};

export type Response = {
    id: string;
    object: 'chat.completion';
    created: number;
    choices: Array<
        | {
              index: number;
              message: FunctionCallMessage;
              finishReason: 'function_call';
          }
        | {
              index: number;
              message: Message;
              finishReason: 'stop';
          }
    >;
    usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
};

const messageToInternal = (message: Message): MessageShape =>
    'functionCall' in message
        ? {
              role: 'assistant',
              content: null,
              function_call: {
                  name: message.functionCall.name,
                  arguments: message.functionCall.arguments,
              },
          }
        : message;

const messageFromInternal = (message: MessageShape): Message =>
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

export function estimatePriceCents(opts: Opts): number {
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
        } satisfies BodyShape),
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
        choices: data.choices.map((choice) =>
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
                      message: messageFromInternal(choice.message),
                  }
        ),
        usage: {
            completionTokens: data.usage.completion_tokens,
            promptTokens: data.usage.prompt_tokens,
            totalTokens: data.usage.total_tokens,
        },
    };
}

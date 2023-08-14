import type { zodToJsonSchema } from 'zod-to-json-schema';

export type Models =
    | 'gpt-4'
    | 'gpt-4-0613'
    | 'gpt-4-32k'
    | 'gpt-4-32k-0613'
    | 'gpt-3.5-turbo'
    | 'gpt-3.5-turbo-0613'
    | 'gpt-3.5-turbo-16k'
    | 'gpt-3.5-turbo-16k-0613';

export type RegularMessageShape = {
    role: 'user' | 'system' | 'assistant';
    content: string;
};

export type RegularAssistantMessageShape = {
    role: 'assistant';
    content: string;
};

export type FunctionCallMessageShape = {
    role: 'assistant';
    content: null;
    function_call: {
        name: string;
        arguments: string;
    };
};

export type FunctionResponseMessageShape = {
    role: 'function';
    name: string;
    content: string;
};

export type MessageShape =
    | RegularMessageShape
    | FunctionCallMessageShape
    | FunctionResponseMessageShape;

export type ResponseMessageShape =
    | RegularAssistantMessageShape
    | FunctionCallMessageShape;

export type FunctionDefinitionShape = {
    name: string;
    description?: string;
    parameters?: ReturnType<typeof zodToJsonSchema>;
};

export type BodyShape = {
    model?: Models;
    messages: Array<MessageShape>;
    functions?: Array<FunctionDefinitionShape>;
    function_call?: 'none' | 'auto' | { name: string };
    max_tokens?: number;
    // between zero to two, defaults to one
    temperature?: number;
};

export type ResponseShape = {
    id: string;
    object: 'chat.completion';
    created: number;
    choices: [
        {
            index: number;
            message: ResponseMessageShape;
            finish_reason: 'stop' | 'function_call' | 'length';
        },
        ...{
            index: number;
            message: ResponseMessageShape;
            finish_reason: 'stop' | 'function_call' | 'length';
        }[]
    ];
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
};

/**
 * @todo Are these useful?
 */
// type _UnsupportedOpts = {
//     // zero to one, nucleus sampling
//     top_p?: number;
//     // How many chat completion choices to generate for each input message
//     n?: number;
//     // streaming mode not supported
//     stream?: false;
//     // value between -2 to 2,
//     // Positive values penalize new tokens based on whether they appear in the text so far, increasing the model's likelihood to talk about new topics
//     presence_penalty?: number;
//     // value between -2 to 2,
//     // Positive values penalize new tokens based on their existing frequency in the text so far, decreasing the model's likelihood to repeat the same line verbatim.
//     frequency_penalty?: number;
//     logit_bias?: {
//         // token values -100 to 100 to ban or prefer a specific token in the response
//         [tokenId: string]: number;
//     };
//     user?: string;
// };

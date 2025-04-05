import type { zodToJsonSchema } from 'zod-to-json-schema';

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

export type ToolCallsMessageShape = {
    role: 'assistant';
    content: null;
    function_call: null;
    tool_calls: Array<{
        id: string;
        type: 'function';
        function: {
            name: string;
            arguments: string;
        };
    }>;
};

export type FunctionCallResultMessageShape = {
    role: 'function';
    name: string;
    content: string;
};

export type ToolCallResultMessageShape = {
    role: 'tool';
    tool_call_id: string;
    content: string;
};

export type MessageShape =
    | RegularMessageShape
    | FunctionCallMessageShape
    | FunctionCallResultMessageShape
    | ToolCallsMessageShape
    | ToolCallResultMessageShape;

export type ResponseMessageShape =
    | RegularAssistantMessageShape
    | FunctionCallMessageShape
    | ToolCallsMessageShape;

export type FunctionDefinitionShape = {
    name: string;
    description?: string;
    parameters?: ReturnType<typeof zodToJsonSchema>;
};

export type BodyShape = {
    model?: string;
    messages: Array<MessageShape>;
    functions?: Array<FunctionDefinitionShape>;
    tools?: Array<{
        type: 'function';
        function: FunctionDefinitionShape;
    }>;
    function_call?: 'none' | 'auto' | { name: string };
    tool_choice?:
        | 'none'
        | 'required'
        | 'auto'
        | { type: 'function'; function: { name: string } };
    max_tokens?: number;
    // between zero to two, defaults to one
    temperature?: number;
    // How many chat completion choices to generate for each input message
    n?: number;
};

export type ResponseShape = {
    id: string;
    object: 'chat.completion';
    created: number;
    choices: [
        {
            index: number;
            message: ResponseMessageShape;
            finish_reason: 'stop' | 'function_call' | 'length' | 'tool_calls';
        },
        ...{
            index: number;
            message: ResponseMessageShape;
            finish_reason: 'stop' | 'function_call' | 'length' | 'tool_calls';
        }[],
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

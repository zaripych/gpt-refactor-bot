import { ensureHasOneElement } from '../../utils/hasOne';
import type { Opts, Response } from '../api';
import type { BodyShape } from '../internalTypes';
import {
    adaptFunctionsCallsAndResultsToRegularMessages,
    adaptFunctionsToDescriptionMessage,
    adaptRegularMessagesToFunctionCalls,
} from './functions';

export const adaptO1RequestBody = (
    opts: Pick<Opts, 'functions' | 'messages' | 'tools'>
): Pick<BodyShape, 'messages' | 'temperature' | 'functions'> => {
    const functionsAndTools = [
        ...(opts.functions && opts.functions.length > 0 ? opts.functions : []),
        ...(opts.tools && opts.tools.length > 0 ? opts.tools : []),
    ];

    const functionDescriptions =
        functionsAndTools.length > 0
            ? adaptFunctionsToDescriptionMessage({
                  functions: functionsAndTools,
                  /**
                   * As of the moment o1 didn't support 'system' messages
                   */
                  role: 'user',
              })
            : [];

    const adaptedFunctionCallsAndResults =
        adaptFunctionsCallsAndResultsToRegularMessages(opts.messages);

    return {
        messages: [
            ...functionDescriptions,
            ...adaptedFunctionCallsAndResults.map((message) => ({
                /**
                 * As of the moment o1 didn't support 'system' messages
                 */
                role: message.role === 'system' ? 'user' : message.role,
                content: message.content,
            })),
        ],
        temperature: 1,
        functions: undefined,
    };
};

export const adaptO1Response = (
    response: Response
): Pick<Response, 'choices'> => {
    return {
        choices: ensureHasOneElement(
            response.choices.map((choice) => {
                const newMessage = adaptRegularMessagesToFunctionCalls(
                    choice.message
                );
                if ('toolCalls' in newMessage) {
                    return {
                        finishReason: 'tool_calls' as const,
                        index: choice.index,
                        message: newMessage,
                    };
                }
                if ('functionCall' in newMessage) {
                    return {
                        finishReason: 'function_call' as const,
                        index: choice.index,
                        message: newMessage,
                    };
                }
                return {
                    finishReason: 'stop' as const,
                    index: choice.index,
                    message: newMessage,
                };
            })
        ),
    };
};

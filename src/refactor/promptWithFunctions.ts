import type {
    FunctionDefinition,
    FunctionResponseMessage,
    Message,
    Models,
    Response,
} from '../chat-gpt/api';
import { calculatePriceCents, chatCompletions } from '../chat-gpt/api';
import { executeFunction } from '../functions/executeFunction';
import type { FunctionsConfig } from '../functions/makeFunction';
import { isTruthy } from '../utils/isTruthy';

export const promptWithFunctions = async (opts: {
    systemPrompt?: string;
    userPrompt: string;
    functions: FunctionDefinition[];
    functionsConfig: Omit<FunctionsConfig, 'strict'>;
    budgetCents: number;
    shouldStop?: (messages: Message[]) => true | Message;
    temperature?: number;
    model?: Models;
}) => {
    const messages: Message[] = [
        opts.systemPrompt && {
            content: opts.systemPrompt,
            role: 'system' as const,
        },
        {
            content: opts.userPrompt,
            role: 'user' as const,
        },
    ].filter(isTruthy);

    const model = opts.model ?? 'gpt-3.5-turbo';

    let spentCents = 0;
    let choice: Response['choices'][number] | undefined;

    while (spentCents < opts.budgetCents) {
        const response = await chatCompletions({
            model,
            messages: messages,
            functions: opts.functions,
            temperature: opts.temperature ?? 0,
        });

        spentCents += calculatePriceCents({
            ...response,
            model,
        });

        if (response.choices.length > 1) {
            throw new Error(
                `There are more than one choice returned from the API, the current implementation is not designed to handle multiple choices`
            );
        }

        choice = response.choices[0];
        if (!choice) {
            throw new Error(`No choices returned from the API`);
        }

        messages.push(choice.message);

        if (choice.finishReason === 'function_call') {
            const { functionCall } = choice.message;

            const result = await executeFunction({
                ...opts.functionsConfig,
                strict: true,
                name: functionCall.name,
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                arguments: JSON.parse(functionCall.arguments),
            })
                .then(
                    (executeResult) =>
                        ({
                            role: 'function',
                            name: functionCall.name,
                            content: JSON.stringify(executeResult),
                        } satisfies FunctionResponseMessage)
                )
                .catch(
                    (e: unknown) =>
                        ({
                            role: 'function',
                            name: functionCall.name,
                            content: JSON.stringify({
                                status: 'error',
                                message:
                                    e instanceof Error ? e.message : String(e),
                            }),
                        } satisfies FunctionResponseMessage)
                );

            messages.push(result);
        }

        if (choice.finishReason === 'stop') {
            const shouldStop = opts.shouldStop ?? (() => true);
            const next = shouldStop(messages);
            if (next === true) {
                break;
            } else {
                messages.push(next);
            }
        }
    }

    return {
        messages,
        spentCents,
    };
};

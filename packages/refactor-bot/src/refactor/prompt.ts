import hash from 'object-hash';
import type { Observable } from 'rxjs';
import { defer, EMPTY, from, lastValueFrom, of } from 'rxjs';
import {
    catchError,
    expand,
    map,
    mergeAll,
    mergeMap,
    switchMap,
    toArray,
} from 'rxjs/operators';
import type { TypeOf } from 'zod';
import { z } from 'zod';

import { makeCachedFunction } from '../cache/makeCachedFunction';
import type { Message } from '../chat-gpt/api';
import { regularAssistantMessageSchema } from '../chat-gpt/api';
import { OutOfContextBoundsError } from '../errors/outOfContextBoundsError';
import { functionsRepositorySchema } from '../functions/prepareFunctionsRepository';
import { llmDependenciesSchema } from '../llm/llmDependencies';
import { line } from '../text/line';
import { ensureHasOneElement } from '../utils/hasOne';
import { isTruthy } from '../utils/isTruthy';
import { refactorConfigSchema } from './types';

export const promptInputSchema = z.object({
    preface: z.string().optional(),
    prompt: z.string(),

    temperature: z.number(),

    choices: z.number().optional(),
    dedupe: z.boolean().optional(),

    seed: z.string().optional(),

    /**
     * Number of times we allow the `shouldStop` function to throw an exception
     * before we re-throw it and fail the whole prompt execution
     */
    maxExceptions: z.number().default(3),

    /**
     * Number of times we allow the `shouldStop` function to continue the prompt
     * before we stop it and fail the whole prompt execution
     */
    maxBounceBacks: z.number().default(3),

    allowedFunctions: refactorConfigSchema.shape.allowedFunctions,

    shouldStop: z
        .function()
        .args(regularAssistantMessageSchema)
        .returns(
            z.union([
                z.promise(z.union([z.literal(true), z.string()])),
                z.union([z.literal(true), z.string()]),
            ])
        )
        .optional(),

    llmDependencies: llmDependenciesSchema,
    functionsRepository: functionsRepositorySchema,
});

export const promptResultSchema = z.object({
    key: z.string().optional(),
    choices: z
        .array(
            z.object({
                resultingMessage: regularAssistantMessageSchema,
            })
        )
        .nonempty(),
});

function removeFunctionFromState(
    opts: {
        messages: Array<Message>;
        name: string;
    } & Pick<TypeOf<typeof promptInputSchema>, 'functionsRepository'>
) {
    // remove bad function name from messages because the ChatGPT
    // API itself chokes on it and stops processing the chain
    const badFunctionIndex = opts.messages.findIndex(
        (fn) =>
            fn.role === 'assistant' &&
            'functionCall' in fn &&
            fn.functionCall.name === opts.name
    );

    if (badFunctionIndex >= 0) {
        opts.messages.splice(badFunctionIndex, 1);
    }

    opts.messages.push({
        role: 'system',
        content:
            `Function "${opts.name}" is not a valid ` +
            `function name. Valid function names are: ` +
            `${opts.functionsRepository().config.allowedFunctions.join(', ')}`,
    });
}

export const prompt = makeCachedFunction({
    name: 'prompt',
    inputSchema: promptInputSchema,
    resultSchema: promptResultSchema,
    transform: async (opts, ctx) => {
        const repository = opts
            .functionsRepository()
            .setAllowedFunctions(opts.allowedFunctions);

        const functionsRepository = () => repository;

        const initialState = () => {
            const messages: Message[] = [
                opts.preface && {
                    content: opts.preface,
                    role: 'system' as const,
                },
                {
                    content: opts.prompt,
                    role: 'user' as const,
                },
            ].filter(isTruthy);

            return {
                status: 'initial-state' as const,
                messages,
                exceptions: 0,
                bounceBacks: 0,
            };
        };

        const stream = from([initialState()]).pipe(
            expand((state) => {
                const lastMessage = state.messages[state.messages.length - 1];
                if (!lastMessage) {
                    throw new Error('Invalid state, no last message found');
                }

                if (state.bounceBacks > opts.maxBounceBacks) {
                    throw new Error(
                        line`
                            ${opts.maxBounceBacks} bounce backs reached - the
                            LLM cannot satisfy validation conditions for the
                            prompt
                        `
                    );
                }

                if (state.exceptions > opts.maxExceptions) {
                    throw new Error(
                        line`
                            ${opts.maxExceptions} exceptions reached - the
                            LLM cannot satisfy validation conditions for the
                            prompt
                        `
                    );
                }

                if (
                    lastMessage.role === 'system' ||
                    lastMessage.role === 'function' ||
                    lastMessage.role === 'user'
                ) {
                    return defer(async () => {
                        const result = await opts.llmDependencies().chat(
                            {
                                ...state,
                                temperature: opts.temperature,
                                choices: opts.choices,
                                functionsRepository,
                            },
                            ctx
                        );

                        const shouldDedupe = opts.dedupe ?? false;

                        const unique = new Map(
                            result.response.choices.map(
                                (choice) =>
                                    [hash(choice.message), choice] as const
                            )
                        );

                        const nextStateChoices = shouldDedupe
                            ? [...unique.values()].map((choice) => ({
                                  status: choice.finishReason,
                                  messages: [...state.messages, choice.message],
                              }))
                            : result.response.choices.map((choice) => ({
                                  status: choice.finishReason,
                                  messages: [...state.messages, choice.message],
                              }));

                        if (
                            nextStateChoices.length === 1 &&
                            nextStateChoices[0]?.status === 'length'
                        ) {
                            throw new OutOfContextBoundsError(
                                `We have hit the maximum length of the context, please try again with a shorter prompt or upgrade to a more expensive model`
                            );
                        }

                        return nextStateChoices.map((choice) => ({
                            ...choice,
                            exceptions: state.exceptions,
                            bounceBacks: state.bounceBacks,
                        }));
                    }).pipe(mergeAll());
                } else if ('functionCall' in lastMessage) {
                    const functionCall = lastMessage.functionCall;
                    return defer(async () => {
                        if (
                            !repository.config.allowedFunctions.find(
                                (fn) => fn === functionCall.name
                            )
                        ) {
                            removeFunctionFromState({
                                functionsRepository,
                                messages: state.messages,
                                name: functionCall.name,
                            });

                            return {
                                status: 'invalid-function-name' as const,
                                messages: state.messages,
                            };
                        }

                        const result =
                            await functionsRepository().executeGptFunction(
                                {
                                    functionCall: lastMessage.functionCall,
                                },
                                ctx
                            );

                        return {
                            status: 'function-execution-result' as const,
                            messages: [...state.messages, result.message],
                        };
                    });
                } else {
                    if (opts.shouldStop) {
                        const shouldStop = opts.shouldStop;
                        const lastMessage = regularAssistantMessageSchema.parse(
                            state.messages[state.messages.length - 1],
                            {
                                errorMap: () => ({
                                    message: `Invalid algorithm, the last message in conversation doesn't conform to the expected schema`,
                                }),
                            }
                        );

                        return defer(async () => {
                            const [result] = await Promise.allSettled([
                                new Promise((resolve) => {
                                    resolve(shouldStop(lastMessage));
                                }),
                            ]);

                            if (
                                result.status === 'fulfilled' &&
                                result.value === true
                            ) {
                                return [];
                            }

                            const exceptions =
                                result.status === 'rejected' ? 1 : 0;

                            const content =
                                result.status === 'rejected'
                                    ? result.reason instanceof Error
                                        ? result.reason.message
                                        : String(result.reason)
                                    : result.value;

                            return [
                                {
                                    status: 'should-not-stop' as const,
                                    messages: [
                                        ...state.messages,
                                        {
                                            role: 'system',
                                            content,
                                        },
                                    ],
                                    exceptions: state.exceptions + exceptions,
                                    bounceBacks: state.bounceBacks + 1,
                                },
                            ];
                        }).pipe(mergeAll());
                    }
                    /**
                     * @note stop expanding but also fix the types so that
                     * TypeScript aware that "initial-state" will get out
                     * of this branch and needs filtering out
                     */
                    return EMPTY as Observable<typeof state>;
                }
            }),
            mergeMap((state) => {
                // everything that gets into expand and what gets out of it
                // will be result of the expand operator, so we must
                // filter out only the stop messages that are not failed
                if (state.status !== 'stop') {
                    return EMPTY;
                }

                const shouldStop = opts.shouldStop;
                if (shouldStop) {
                    // we also need to filter out the stop messages that are
                    // failed when shouldStop was called with their content
                    return defer(async () => {
                        const lastMessage = regularAssistantMessageSchema.parse(
                            state.messages[state.messages.length - 1],
                            {
                                errorMap: () => ({
                                    message: `Invalid algorithm, the last message in conversation doesn't conform to the expected schema`,
                                }),
                            }
                        );

                        const shouldUseStopMessage =
                            await shouldStop(lastMessage);

                        return shouldUseStopMessage === true;
                    }).pipe(
                        catchError(() => of(false)),
                        switchMap((shouldUseStopMessage) =>
                            shouldUseStopMessage ? of(state) : EMPTY
                        )
                    );
                }

                return of(state);
            }),
            map((state) => {
                return {
                    resultingMessage: regularAssistantMessageSchema.parse(
                        state.messages[state.messages.length - 1],
                        {
                            errorMap: () => ({
                                message: `Invalid algorithm, the last message in conversation doesn't conform to the expected schema`,
                            }),
                        }
                    ),
                };
            }),
            toArray()
        );

        const choices = ensureHasOneElement(await lastValueFrom(stream));

        return {
            key: ctx.location,
            choices,
        };
    },
});

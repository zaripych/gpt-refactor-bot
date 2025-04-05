/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import { setInterval } from 'node:timers';

import { mkdir, readFile, stat } from 'fs/promises';
import ora, { oraPromise } from 'ora';
import { dirname, join } from 'path';
import {
    concatMap,
    defer,
    finalize,
    fromEvent,
    ignoreElements,
    of,
    takeUntil,
} from 'rxjs';
import stripAnsi from 'strip-ansi';

import type { Message, Models } from '../chat-gpt/api';
import { actions, declareAction, dispatch } from '../event-bus';
import { ofTypes } from '../event-bus/operators';
import { findRepositoryRoot } from '../file-system/findRepositoryRoot';
import { prepareFunctionsRepository } from '../functions/prepareFunctionsRepository';
import { allowedFunctionsSchema, functions } from '../functions/registry';
import { gptRequestFailed } from '../llm/actions/gptRequestFailed';
import { gptRequestStarted } from '../llm/actions/gptRequestStarted';
import { gptRequestSuccess } from '../llm/actions/gptRequestSuccess';
import { prepareLlmDependencies } from '../llm/llmDependencies';
import {
    markdown,
    prettifyMarkdownForConsoleOutput,
    printMarkdown,
} from '../markdown/markdown';
import type { PromptChainMiddleware } from '../refactor/prompt';
import { prompt } from '../refactor/prompt';
import { format } from '../text/format';
import {
    clearScreenFromCursorTillTheEnd,
    restoreCursorPosition,
    saveCursorPosition,
} from '../utils/ansi';
import { UnreachableError } from '../utils/UnreachableError';
import { conversationState } from './conversation';
import { formatMessage, printMessage } from './formatMessage';
import { promptForConversationFile } from './input-prompts/promptForConversationFile';
import { promptForNewFileName } from './input-prompts/promptForNewFileName';
import { createWatcher } from './watcher';

const note = '**NOTE**';

const hr = '`"---"`';

const text = {
    watchingSpinnerText: () =>
        format(
            markdown`
                Watching for file changes, please finish with a user prompt and
                confirm with %hr% to send it ...
            `,
            { hr }
        ),

    watchingWithLastMessage: (lastMessage: Message) =>
        [
            markdown`
                # Watching

                Last message is from **\`${lastMessage.role}\`**
            `,
            formatMessage(lastMessage),
            '',
        ].join('\n\n---\n\n'),

    watchingCannotSend: () =>
        format(
            markdown`
                Last message is not a user prompt, please add another message
                and finish with %hr% to confirm ...
            `,
            { hr }
        ),

    watchingNoConfirmation: () =>
        format(
            markdown`
                %note% We can send your request now ... finish with %hr% to
                confirm ...
            `,
            { hr, note }
        ),

    errorNoMessagesToSend: format(
        markdown`
            # Stop Condition

            No messages to send, exiting ... finish your message with a %hr% to
            indicate an end of a message.
        `,
        { hr }
    ),

    requesting: `# Requesting`,

    requestingSpinnerText: `Sending messages to the OpenAI API ...`,

    totalSpend: (total: string) => markdown`
        # Total Spend

        You have spent **USD ${total}** so far.
    `,

    usingFrontmatterModel: (model: Models) =>
        format(
            markdown`
                Using model **\`%model%\`** specified in the frontmatter.
            `,
            { model }
        ),

    usingCliFlagModel: (model: Models) =>
        format(`Using model **\`%model%\`** specified via cli flag.`, {
            model,
        }),

    usingDefaultModel: (model: Models) =>
        format(
            markdown`
                Using model **\`%model%\`**, you can specify a different model
                by specifying it using \`--model\` flag of the cli or using the
                frontmatter in the conversation .md file.
            `,
            { model }
        ),

    startOfConversationText: (opts: { messages: Message[] }) =>
        format(
            markdown`
                # Started with

                %messages%
            `,
            {
                messages: opts.messages
                    .map((message) => formatMessage(message))
                    .join('\n\n---\n\n'),
            }
        ),

    lastMessageText: (opts: { message: Message }) =>
        format(
            markdown`
                # %header%

                %message%
            `,
            {
                header:
                    opts.message.role === 'assistant'
                        ? 'Response'
                        : 'Last message',
                message: formatMessage(opts.message),
            }
        ),
};

const suggestEditingFile = async (file: string) => {
    const contents = await readFile(file, 'utf-8');

    await printMarkdown(
        format(
            markdown`
                ---

                Edit the file in your editor to retry/continue:

                [%path%]()
            `,
            {
                path: `${file}:${contents.split('\n').length}:1`,
            }
        )
    );
};

const createFileWithDefaultContents = async (conversationFile: string) => {
    await mkdir(dirname(conversationFile), { recursive: true });

    await conversationState({
        conversationFile,
    }).save();
};

const initialize = async (opts: {
    model?: Models;
    watch?: boolean;
    manual?: boolean;
    functions?: string[];
}) => {
    const stopController = new AbortController();

    process.on('SIGINT', () => {
        spinner.stop();
        stopController.abort();
        setInterval(() => {
            void import('wtfnode').then(({ dump }) => {
                dump();
                console.error('Have to forcefully exit for some reason');
                process.exit(1);
            });
        }, 5_000).unref();
    });

    const repositoryRoot = await findRepositoryRoot();

    const functionsRepository = await prepareFunctionsRepository({
        functions,
        config: {
            repositoryRoot,
        },
    });
    const conversationsDirectory = join(
        repositoryRoot,
        '.refactor-bot',
        'prompts'
    );
    const answers = await promptForConversationFile(conversationsDirectory);
    if (!answers) {
        return;
    }
    if (answers.file === 'new') {
        const result = await promptForNewFileName();
        if (!result) {
            return;
        }
        answers.file = result.name;
    }

    if (!answers.file) {
        return;
    }

    const conversationFile = join(conversationsDirectory, answers.file);
    const fileExists = await stat(conversationFile)
        .then((f) => f.isFile())
        .catch(() => false);

    if (!fileExists) {
        await createFileWithDefaultContents(conversationFile);
        await suggestEditingFile(conversationFile);

        if (!opts.watch) {
            return;
        }
    }

    const conversation = conversationState({
        conversationFile,
    });
    await conversation.load();

    const defaultModel = 'gpt-4o';

    let model = conversation.opts.model ?? opts.model ?? defaultModel;

    const llmDependencies = await prepareLlmDependencies({
        model,
        modelByStepCode: {},
        useMoreExpensiveModelsOnRetry: {},
    });

    const scheduleConsoleOutputAction = declareAction(
        'scheduleConsoleOutput',
        (action: () => Promise<void>) => ({
            action,
        })
    );

    const printAboutModel = async () => {
        if (conversation.opts.model) {
            await printMarkdown(
                text.usingFrontmatterModel(conversation.opts.model)
            );
        } else if (opts.model) {
            await printMarkdown(text.usingCliFlagModel(opts.model));
        } else {
            await printMarkdown(text.usingDefaultModel(model));
        }
    };

    await printAboutModel();

    const watcher = createWatcher();

    const refreshModel = async () => {
        const nextModel = conversation.opts.model ?? opts.model ?? defaultModel;
        if (model !== nextModel) {
            await printAboutModel();
        }
        model = nextModel;
    };

    const spinner = ora();

    const displaySpinnerText = async (
        text: string,
        opts?: {
            hint?: boolean;
        }
    ) => {
        spinner.text = await prettifyMarkdownForConsoleOutput(text);
        if (opts?.hint) {
            await conversation.hint(stripAnsi(spinner.text));
        }
    };

    const displayProgressText = async <T>(
        promise: Promise<T>,
        fn: string | ((s: typeof spinner) => string)
    ) => {
        return oraPromise(promise, {
            text:
                typeof fn === 'string'
                    ? fn
                    : await prettifyMarkdownForConsoleOutput(fn(spinner)),
        });
    };

    const stop = stopController.signal.aborted
        ? of(true)
        : fromEvent(stopController.signal, 'abort');

    actions()
        .pipe(
            ofTypes(
                gptRequestStarted,
                gptRequestSuccess,
                gptRequestFailed,
                scheduleConsoleOutputAction
            ),
            takeUntil(stop),
            concatMap(async (action) => {
                switch (action.type) {
                    case gptRequestStarted.type:
                        await printMarkdown(text.requesting);
                        spinner.start(text.requestingSpinnerText);
                        if (opts.watch) {
                            await conversation.hint(
                                stripAnsi(text.requestingSpinnerText)
                            );
                        }
                        return;
                    case gptRequestSuccess.type:
                        spinner.succeed();
                        spinner.text = '';
                        return;
                    case gptRequestFailed.type:
                        spinner.fail();
                        spinner.text = '';
                        return;
                    case scheduleConsoleOutputAction.type:
                        {
                            let spinnerText;
                            if (spinner.isSpinning) {
                                spinnerText = spinner.text;
                                spinner.stop();
                            }
                            await action.data.action();
                            if (spinnerText) {
                                spinner.start(spinnerText);
                            }
                        }
                        return;
                    default:
                        throw new UnreachableError(action);
                }
            }),
            ignoreElements(),
            finalize(() => {
                spinner.stop();
            })
        )
        .subscribe({
            error: (error) => {
                console.error(error);
            },
        });

    const printAndSaveNewConversationMessages = (): PromptChainMiddleware => {
        return ({ state }) => {
            return defer(async () => {
                if (state.messages.length <= conversation.messages.length) {
                    return;
                }

                for (const message of state.messages.slice(
                    conversation.messages.length
                )) {
                    dispatch(
                        scheduleConsoleOutputAction(async () => {
                            await printMessage({
                                message,
                                prefixDivider: true,
                            });
                        })
                    );
                }

                conversation.messages.splice(
                    0,
                    conversation.messages.length,
                    ...state.messages
                );
                await conversation.save();
            }).pipe(ignoreElements());
        };
    };

    const promptWrapped = async () => {
        await prompt({
            messages: conversation.messages,
            abortSignal: () => stopController.signal,
            functionsRepository: () => functionsRepository,
            llmDependencies: () => llmDependencies,
            temperature: 0,
            choices: 1,
            middlewares: (defaults) => [
                printAndSaveNewConversationMessages(),
                ...defaults.defaultMiddlewares,
            ],
            ...(opts.functions && {
                allowedFunctions: allowedFunctionsSchema.parse(opts.functions),
            }),
        });
    };

    return {
        conversation,
        stopController,
        conversationFile,
        functionsRepository,
        watcher,
        get model() {
            return model;
        },
        watchForChangesOnce: async () => {
            return watcher.watchForChangesOnce(conversationFile, {
                signal: stopController.signal,
            });
        },
        refreshModel,
        displaySpinnerText,
        displayProgressText,
        prompt: promptWrapped,
    };
};

export const run = async (opts: {
    model?: Models;
    watch?: boolean;
    manual?: boolean;
    functions?: string[];
}) => {
    const state = await initialize(opts);
    if (!state) {
        return;
    }

    const {
        conversation,
        stopController,
        watchForChangesOnce,
        displaySpinnerText,
        displayProgressText,
        prompt,
    } = state;

    const firstMessages = conversation.messages
        .slice(0, 2)
        .filter(
            (message) => message.role === 'user' || message.role === 'system'
        );
    if (firstMessages.length > 0) {
        await printMarkdown(
            text.startOfConversationText({
                messages: firstMessages,
            })
        );
    }

    while (!stopController.signal.aborted) {
        saveCursorPosition();

        while (!conversation.sendConfirmed() && opts.watch) {
            restoreCursorPosition();
            clearScreenFromCursorTillTheEnd();

            if (stopController.signal.aborted) {
                break;
            }

            if (conversation.lastMessage) {
                await printMarkdown(
                    text.watchingWithLastMessage(conversation.lastMessage)
                );
            }

            await displayProgressText(
                watchForChangesOnce(),
                (spinner) => spinner.text || text.watchingSpinnerText()
            );

            await state.conversation.load();

            await displaySpinnerText(
                !conversation.canSend()
                    ? text.watchingCannotSend()
                    : text.watchingNoConfirmation(),
                {
                    hint: true,
                }
            );
            await watchForChangesOnce();
        }

        if (stopController.signal.aborted) {
            break;
        }

        if (conversation.canSend()) {
            await prompt();
        } else {
            await printMarkdown(text.errorNoMessagesToSend);

            if (!opts.watch) {
                break;
            }
            if (stopController.signal.aborted) {
                break;
            }
        }
    }
};

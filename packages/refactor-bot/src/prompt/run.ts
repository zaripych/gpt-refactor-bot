import chalk from 'chalk';
import { mkdir, writeFile } from 'fs/promises';
import { globby } from 'globby';
import orderBy from 'lodash-es/orderBy';
import ora, { oraPromise } from 'ora';
import { join } from 'path';
import prompts from 'prompts';
import stripAnsi from 'strip-ansi';

import type {
    FunctionResultMessage,
    Message,
    Models,
    Response,
} from '../chat-gpt/api';
import {
    calculatePrice,
    chatCompletions,
    estimatePrice,
} from '../chat-gpt/api';
import { spawnResult } from '../child-process/spawnResult';
import { findRepositoryRoot } from '../file-system/findRepositoryRoot';
import { executeFunction } from '../functions/executeFunction';
import { includeFunctions } from '../functions/includeFunctions';
import { markdown, printMarkdown } from '../markdown/markdown';
import { format } from '../text/format';
import { line } from '../text/line';
import {
    clearScreenFromCursorTillTheEnd,
    restoreCursorPosition,
    saveCursorPosition,
} from '../utils/ansi';
import { isTruthy } from '../utils/isTruthy';
import { conversationState } from './conversation';
import { goToEndOfFile } from './editor';
import { formatMessage, printMessage } from './print';
import { header } from './serialize';
import { createWatcher } from './watcher';

async function promptForFile(dirContents: string[]) {
    const answers = (await prompts({
        name: 'file',
        message: 'Select a file where the conversation is going to be stored',
        type: 'select',
        choices: [
            ...dirContents.map((file) => ({
                title: file.replace('.md', ''),
                value: file,
            })),
            {
                title: 'New conversation...',
                value: 'new',
            },
        ],
    })) as {
        file: string;
    };
    if (!answers.file) {
        process.exit(0);
    }
    return answers;
}

async function promptForNewFileName() {
    const result = (await prompts({
        name: 'name',
        message: 'Please specify the name of the file',
        type: 'text',
        hint: markdown`
            The file will be stored in the ./prompts directory and will have .md
            extension
        `,
        format: (value: string) => `${value}.md`,
    })) as {
        name: string;
    };
    if (!result.name) {
        process.exit(0);
    }
    return result;
}

async function promptForNextAction(
    options: Array<'discard' | 'save' | 'execute' | 'auto'>,
    choice?: Response['choices'][0]
) {
    const questionText =
        choice?.finishReason === 'function_call'
            ? format(
                  markdown`
                      The OpenAI model wants you to execute function %name%.
                      Please choose one of the options below:
                  `,
                  {
                      name: chalk.bgYellowBright(
                          choice.message.functionCall.name
                      ),
                  }
              )
            : `Please choose one of the options below:`;

    const result = (await prompts({
        name: 'nextAction',
        message: questionText,
        type: 'select',
        choices: [
            options.includes('discard') && {
                title: 'Discard',
                value: 'discard' as const,
            },
            options.includes('save') && {
                title: 'Save',
                value: 'save' as const,
            },
            options.includes('execute') && {
                title: 'Execute the function',
                value: 'execute' as const,
            },
            options.includes('auto') && {
                title: 'Continue until the OpenAI model decides to finish',
                value: 'auto' as const,
            },
        ].filter(isTruthy),
    })) as {
        nextAction: 'discard' | 'save' | 'execute' | 'auto' | undefined;
    };
    if (!result.nextAction) {
        process.exit(0);
    }

    return result;
}

const note = chalk.green.bold('NOTE');

const hr = chalk.green('"') + chalk.greenBright('---') + chalk.green('"');

const text = {
    watchingSpinnerText: (price: string) =>
        format(
            markdown`
                Watching for file changes, please finish with a user prompt and
                confirm with %hr% to send it ... [+ ~USD %price%]
            `,
            { hr, price }
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

    watchingCannotSend: (price: string) =>
        format(
            markdown`
                Last message is not a user prompt, please add another message
                and finish with %hr% to confirm ... [+ ~USD %price%]
            `,
            { price, hr }
        ),

    watchingNoConfirmation: (price: string) =>
        format(
            markdown`
                %note% We can send your request now ... finish with %hr% to
                confirm ... [+ ~USD %price%]
            `,
            { hr, note, price }
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
};

export const run = async (opts: {
    model?: Models;
    watch?: boolean;
    manual?: boolean;
}) => {
    const spinner = ora();

    const repoRoot = await findRepositoryRoot();
    const dir = join(repoRoot, '.refactor-bot', 'prompts');
    const dirContents = orderBy(
        await globby('*.md', {
            cwd: dir,
            ignore: ['_*.md'],
            onlyFiles: true,
            stats: true,
            objectMode: true,
        }),
        (file) => file.stats?.ctimeMs,
        'desc'
    );

    const answers = await promptForFile(dirContents.map((file) => file.name));

    if (answers.file === 'new') {
        const result = await promptForNewFileName();
        await mkdir(dir, { recursive: true });
        await writeFile(join(dir, result.name), header, 'utf-8');

        await spawnResult(
            'code',
            ['-g', `${join(dir, result.name)}:${header.split('\n').length}:1`],
            {
                exitCodes: 'any',
            }
        );
        answers.file = result.name;

        if (!opts.watch) {
            return;
        }
    }

    if (!answers.file) {
        return;
    }

    const conversationFile = join(dir, answers.file);

    const convo = conversationState(conversationFile);
    await convo.load();

    const functions = await includeFunctions('all');

    await goToEndOfFile(conversationFile);

    let isManual = opts.manual;

    const watcher = createWatcher();

    let totalPrice = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
        saveCursorPosition();

        while (!convo.sendConfirmed() && opts.watch) {
            restoreCursorPosition();
            clearScreenFromCursorTillTheEnd();

            if (convo.lastMessage) {
                await printMarkdown(
                    text.watchingWithLastMessage(convo.lastMessage)
                );
            }

            const price = estimatePrice({
                model: opts.model ?? 'gpt-3.5-turbo',
                messages: convo.messages,
                functions,
            }).toFixed(4);

            await oraPromise(watcher.watchForChangesOnce(conversationFile), {
                text: spinner.text || text.watchingSpinnerText(price),
            });

            await convo.load();

            if (!convo.canSend()) {
                spinner.text = text.watchingCannotSend(price);
                await convo.hint(stripAnsi(spinner.text));
                await watcher.watchForChangesOnce(conversationFile);
            } else if (!convo.sendConfirmed()) {
                spinner.text = text.watchingNoConfirmation(price);
                await convo.hint(stripAnsi(spinner.text));
                await watcher.watchForChangesOnce(conversationFile);
            }
        }

        let choice: Response['choices'][0];
        if (convo.canSend()) {
            await printMarkdown(text.requesting);
            if (opts.watch) {
                await convo.hint(text.requesting);
            }

            const response = await oraPromise(
                chatCompletions({
                    model: opts.model ?? 'gpt-3.5-turbo',
                    messages: convo.messages,
                    functions,
                    temperature: 0,
                }),
                {
                    text: text.requestingSpinnerText,
                }
            );
            totalPrice += calculatePrice({
                model: opts.model ?? 'gpt-3.5-turbo',
                ...response,
            }).totalPrice;

            if (response.choices.length > 1) {
                throw new Error(line`
                    There are more than one choice returned from the API,
                    the current implementation is not designed to handle
                    multiple choices
                `);
            }

            choice = response.choices[0];

            // print last known request/message:
            if (convo.lastMessage && !opts.watch) {
                await printMarkdown(formatMessage(convo.lastMessage));
            }

            // add new message:
            convo.messages.push(choice.message);
            await printMarkdown(formatMessage(choice.message, true));
        } else {
            const { lastMessage } = convo;
            if (
                lastMessage &&
                lastMessage.role === 'assistant' &&
                'functionCall' in lastMessage
            ) {
                choice = {
                    index: 0,
                    finishReason: 'function_call' as const,
                    message: lastMessage,
                };
            } else {
                await printMarkdown(text.errorNoMessagesToSend);
                return;
            }
        }

        await printMarkdown(text.totalSpend(totalPrice.toFixed(4)));

        if (isManual) {
            let result = await promptForNextAction(
                (
                    [
                        'discard',
                        'save',
                        choice.finishReason === 'function_call' && 'execute',
                        choice.finishReason !== 'stop' && 'auto',
                    ] as const
                ).filter(isTruthy),
                choice
            );

            if (result.nextAction === 'save') {
                await convo.save();
            }

            if (
                choice.finishReason === 'function_call' &&
                result.nextAction !== 'execute'
            ) {
                result = await promptForNextAction(['execute', 'auto'], choice);
            }

            isManual = result.nextAction !== 'auto';
        } else {
            await convo.save();
        }

        if (choice.finishReason === 'function_call') {
            try {
                const { functionCall } = choice.message;
                const result = await executeFunction({
                    name: functionCall.name,
                    arguments: JSON.parse(functionCall.arguments),
                })
                    .then(
                        (executeResult) =>
                            ({
                                role: 'function',
                                name: functionCall.name,
                                content: JSON.stringify(executeResult),
                            }) satisfies FunctionResultMessage
                    )
                    .catch(
                        (e: unknown) =>
                            ({
                                role: 'function',
                                name: functionCall.name,
                                content: JSON.stringify({
                                    status: 'error',
                                    message:
                                        e instanceof Error
                                            ? e.message
                                            : String(e),
                                }),
                            }) satisfies FunctionResultMessage
                    );

                convo.messages.push(result);
                await printMessage(result, true);

                if (isManual) {
                    const promptResult = await promptForNextAction(
                        ['discard', 'save', 'auto'],
                        choice
                    );

                    if (promptResult.nextAction === 'save') {
                        await convo.save();
                    }
                } else {
                    await convo.save();
                }
            } catch (e) {
                throw new Error(`Failed to execute the function`, {
                    cause: e,
                });
            }
        } else {
            if (!opts.watch) {
                break;
            }
        }
    }
};

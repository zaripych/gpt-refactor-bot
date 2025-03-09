import chalk from 'chalk';
import prompts from 'prompts';

import type { Response } from '../../chat-gpt/api';
import { markdown } from '../../markdown/markdown';
import { format } from '../../text/format';
import { isTruthy } from '../../utils/isTruthy';

export async function promptForNextAction(
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
        return undefined;
    }

    return result;
}

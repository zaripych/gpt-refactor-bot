import { globby } from 'globby';
import orderBy from 'lodash-es/orderBy';
import prompts from 'prompts';

export async function promptForConversationFile(
    conversationsDirectory: string
) {
    const dirContents = orderBy(
        await globby('*.md', {
            cwd: conversationsDirectory,
            ignore: ['_*.md'],
            onlyFiles: true,
            stats: true,
            objectMode: true,
        }),
        (file) => file.stats?.ctimeMs,
        'desc'
    );

    const answers = (await prompts({
        name: 'file',
        message: 'Select a file where the conversation is going to be stored',
        type: 'select',
        choices: [
            ...dirContents
                .map((file) => file.name)
                .map((file) => ({
                    title: file.replace('.md', ''),
                    value: file,
                })),
            {
                title: 'Create new...',
                value: 'new',
            },
        ],
    })) as {
        file: string;
    };

    if (!answers.file) {
        return undefined;
    }

    return answers;
}

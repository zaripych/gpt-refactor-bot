import prompts from 'prompts';

import { markdown } from '../../markdown/markdown';

export async function promptForNewFileName() {
    const result = (await prompts({
        name: 'name',
        message: 'Please specify the name of the file',
        type: 'text',
        hint: markdown`
            The file will be stored in the ./prompts directory and will have .md
            extension
        `,
    })) as {
        name: string;
    };

    if (!result.name) {
        return undefined;
    }

    return {
        name: `${result.name.replaceAll(/.md$/g, '')}.md`,
    };
}

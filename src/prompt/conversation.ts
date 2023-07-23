import { readFile, writeFile } from 'fs/promises';

import type { Message } from '../chat-gpt/api';
import { prettierMarkdown } from '../prettier/prettier';
import { parseMessages } from './parse';
import { serializeMessages } from './serialize';

export const conversationState = (conversationFile: string) => {
    let contents: string;
    let messages: Message[] = [];

    const load = async () => {
        contents = await readFile(conversationFile, 'utf-8');
        messages = parseMessages(contents);
    };

    const save = async () => {
        contents = serializeMessages(messages);
        await writeFile(
            conversationFile,
            await prettierMarkdown(contents),
            'utf-8'
        );
    };

    const hint = async (message: string) => {
        contents = serializeMessages(messages);
        contents += `\n\n> @hint ${message}\n\n`;
        await writeFile(
            conversationFile,
            await prettierMarkdown(contents),
            'utf-8'
        );
    };

    const canSend = () =>
        messages.length > 0 &&
        messages[messages.length - 1]?.role !== 'assistant';

    const sendConfirmed = () => canSend() && /---\n*$/g.exec(contents);

    return {
        load,
        save,
        hint,
        get messages() {
            return messages;
        },
        get lastMessage() {
            return messages[messages.length - 1];
        },

        canSend,
        sendConfirmed,
    };
};

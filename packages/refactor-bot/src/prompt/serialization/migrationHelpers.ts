/**
 * These functions help us save conversations as JSON and/or Markdown
 * and convert between two different versions of ./serialization/*.ts
 */
/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { readFile, writeFile } from 'node:fs/promises';

import { globby } from 'globby';

import { conversationState } from '../conversation';

// @ts-ignore Allow unused variable for future use
async function saveConversationsAsJson(conversationsDir: string) {
    const files = await globby(`*.md`, {
        cwd: conversationsDir,
        absolute: true,
    });

    for (const file of files) {
        const conv = conversationState({
            conversationFile: file,
        });
        await conv.load();
        const content = JSON.stringify(conv.messages, undefined, 2);
        await writeFile(`${file}.json`, content, 'utf-8');
    }
}

// @ts-ignore Allow unused variable for future use
async function saveConversationsAsMd(conversationsDir: string) {
    const files = await globby(`*.json`, {
        cwd: conversationsDir,
        absolute: true,
    });

    for (const file of files) {
        const jsonText = await readFile(file, 'utf-8');
        const messages = JSON.parse(jsonText) as typeof conv.messages;
        const conv = conversationState({
            conversationFile: file.replace(/\.json$/, ''),
        });
        conv.messages.splice(0, conv.messages.length, ...messages);
        await conv.save();
    }
}

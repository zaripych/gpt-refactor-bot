import { readFile, writeFile } from 'fs/promises';
import { load as loadYaml } from 'js-yaml';
import { z } from 'zod';

import { type Message, modelsSchema } from '../chat-gpt/api';
import { markdown } from '../markdown/markdown';
import { prettierMarkdown } from '../prettier/prettier';
import { iterateFencedCodeBlocks } from '../response-parsers/parseFencedCodeBlocks';
import { parseMessages } from './parseMessages';
import { serializeMessages } from './serialization/serializeMessages';

export const header = markdown`
    > This is a conversation with a OpenAI model. You can edit this file
    > manually to enter a new prompt and then execute
    > \`pnpm refactor-bot prompt\` to continue the conversation.

    > Messages are separated by a \`---\`. The application is going to
    > automatically add \`> @role [user|assistant|system]\` to the messages
    > depending on their order. Feel free to modify the comment to change the
    > role of a message. All quotes are considered comments.
`;

export const conversationState = (opts: { conversationFile: string }) => {
    const { conversationFile } = opts;

    const frontmatterSchema = z.string().transform((text) =>
        z
            .object({
                model: modelsSchema.optional(),
                functions: z.array(z.string()).optional(),
            })
            .optional()
            .default({})
            .parse(loadYaml(text) || undefined)
    );

    let contents: string;
    let frontmatter: string = '';
    let parsedFrontmatter: z.infer<typeof frontmatterSchema> = {};
    let messages: Message[] = [];
    let sendConfirmedText: string = '';

    const load = async () => {
        contents = await readFile(conversationFile, 'utf-8');
        for (const block of iterateFencedCodeBlocks(contents)) {
            if (block.language === 'yaml' && block.start === 0) {
                frontmatter = block.block + '\n\n';
                parsedFrontmatter = frontmatterSchema.parse(block.code);
            }
            break;
        }
        if (frontmatter) {
            contents = contents.slice(frontmatter.length - 2);
        }
        messages = parseMessages(contents);
        sendConfirmedText = /---\n*$/g.exec(contents) ? '\n---\n' : '';
    };

    const save = async (file?: string) => {
        contents = frontmatter + header + '\n\n' + serializeMessages(messages);
        await writeFile(
            file ?? conversationFile,
            await prettierMarkdown({
                md: contents,
                repositoryRoot: process.cwd(),
            }),
            'utf-8'
        );
    };

    const hint = async (message: string) => {
        contents =
            frontmatter +
            header +
            '\n\n' +
            serializeMessages(messages) +
            sendConfirmedText;
        contents += `\n\n> @hint ${message
            .trim()
            .replaceAll('\n', '\n> ')}\n\n`;
        await writeFile(
            conversationFile,
            await prettierMarkdown({
                md: contents,
                repositoryRoot: process.cwd(),
            }),
            'utf-8'
        );
    };

    const canSend = () => {
        const lastMessage = messages[messages.length - 1];
        return (
            (messages.length > 0 && lastMessage?.role !== 'assistant') ||
            (lastMessage?.role === 'assistant' &&
                ('functionCall' in lastMessage || 'toolCalls' in lastMessage))
        );
    };

    const sendConfirmed = () => Boolean(canSend() && sendConfirmedText);

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

        /**
         * Check if the last message is not from the assistant, if last message
         * is from assistant it is expected that either the user specifies a new
         * message, or the system adds a message with function results.
         */
        canSend,

        /**
         * Check if the user is ready to send a message, this is determined
         * by checking if the text of the file ends with `---\n`
         */
        sendConfirmed,

        get opts() {
            return parsedFrontmatter;
        },
    };
};

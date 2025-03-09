import { dump, load } from 'js-yaml';
import { z } from 'zod';

import type {
    FunctionCallMessage,
    FunctionCallResultMessage,
    Message,
    MessageRole,
    ToolCallResultMessage,
    ToolCallsMessage,
} from '../../chat-gpt/api';
import { markdown } from '../../markdown/markdown';
import { formatFencedCodeBlock } from '../../prompt-formatters/formatFencedCodeBlock';
import { parseFencedCodeBlocks } from '../../response-parsers/parseFencedCodeBlocks';
import { format } from '../../text/format';
import { ensureHasOneElement } from '../../utils/hasOne';
import { ensureTruthy } from '../../utils/isTruthy';
import {
    argumentSerializersByFunctionName,
    resultSerializersByFunctionName,
} from './serializersByFunction';

const attributeKeySchema = z.string().regex(/^[a-zA-Z0-9_-]+$/);

export type Context = {
    index?: number;
    messages?: Message[];
    resultSerializersByFunctionName?: Record<
        string,
        {
            serializeResult: (
                args: string | undefined,
                results: string,
                defaultSerialize: (
                    args: string | undefined,
                    results: string
                ) => {
                    code: string;
                    prettierIgnore?: boolean;
                    language?: string;
                }
            ) => {
                code: string;
                prettierIgnore?: boolean;
                language?: string;
            };
            deserializeResult: (
                serialized: string,
                defaultDeserialize: (serialized: string) => string
            ) => string;
        }
    >;
    argumentSerializersByFunctionName?: Record<
        string,
        {
            serializeArgument: (
                args: string,
                defaultSerialize: (args: string) => {
                    code: string;
                    prettierIgnore?: boolean;
                    language?: string;
                }
            ) => {
                code: string;
                prettierIgnore?: boolean;
                language?: string;
            };
            deserializeArgument: (
                serialized: string,
                defaultDeserialize: (serialized: string) => string
            ) => string;
        }
    >;
    serializeAsYaml?: boolean;
};

const defaultCtx: Partial<Context> = {
    argumentSerializersByFunctionName,
    resultSerializersByFunctionName,
    serializeAsYaml: true,
};

function escapeValueSpecials(value: string) {
    if (value.includes(' ')) {
        return JSON.stringify(value);
    } else {
        return value;
    }
}

function serializeAttribute(opts: { key: string; value: string }) {
    return [
        `@${attributeKeySchema.parse(opts.key)}`,
        escapeValueSpecials(opts.value),
    ].join(' ');
}

export function serializeHint(hint: string) {
    return `\n\n> @hint ${hint.trim().replaceAll('\n', '\n> ')}\n\n`;
}

function serializeMessageWithAttributes(opts: {
    attributes: Record<string, string>;
    contents: string;
}) {
    return format(
        markdown`
            > %attrs%

            %contents%
        `,
        {
            attrs: Object.entries(opts.attributes)
                .map(([key, value]) => serializeAttribute({ key, value }))
                .join(' '),
            contents: opts.contents,
        }
    );
}

function tryParseJson(json: string) {
    try {
        return JSON.parse(json) as unknown;
    } catch {
        return undefined;
    }
}

function serializeFunctionCallResult(
    message: FunctionCallResultMessage,
    ctx?: Context
): string {
    const serializer = ctx?.resultSerializersByFunctionName?.[message.name];

    const args = ctx?.messages?.find<FunctionCallMessage>(
        (m): m is FunctionCallMessage =>
            'functionCall' in m && m.functionCall.name === message.name
    )?.functionCall.arguments;

    const defaultSerialize = (_args: string | undefined, code: string) => {
        const parsedJson = tryParseJson(code);
        if (parsedJson && typeof parsedJson === 'string') {
            return {
                code: parsedJson,
                language: 'text',
            };
        } else if (parsedJson && ctx?.serializeAsYaml) {
            return {
                code: dump(parsedJson, { indent: 2 }).trim(),
                language: 'yaml',
            };
        } else if (parsedJson) {
            return {
                code,
                language: 'json',
            };
        } else {
            return {
                code,
            };
        }
    };

    const serialize = serializer
        ? serializer.serializeResult
        : defaultSerialize;

    return formatFencedCodeBlock(
        serialize(args, message.content, defaultSerialize)
    );
}

function serializeToolCallResult(
    message: ToolCallResultMessage,
    ctx?: Context & {
        fn?: {
            name: string;
            arguments: string;
        };
    }
): string {
    const fn =
        ctx?.fn ??
        ctx?.messages
            ?.flatMap((m) => ('toolCalls' in m ? m.toolCalls : []))
            .find((tool) => tool.id === message.toolCallId)?.function;

    const serializer = fn?.name
        ? ctx?.resultSerializersByFunctionName?.[fn.name]
        : undefined;

    const defaultSerialize = (_args: string | undefined, code: string) => {
        const parsedJson = tryParseJson(code);
        if (parsedJson && typeof parsedJson === 'string') {
            return {
                code: parsedJson,
                language: 'text',
            };
        } else if (parsedJson && ctx?.serializeAsYaml) {
            return {
                code: dump(parsedJson, { indent: 2 }).trim(),
                language: 'yaml',
            };
        } else if (parsedJson) {
            return {
                code,
                language: 'json',
            };
        } else {
            return {
                code,
            };
        }
    };

    const serialize = serializer
        ? serializer.serializeResult
        : defaultSerialize;

    return formatFencedCodeBlock(
        serialize(fn?.arguments, message.content, defaultSerialize)
    );
}

function serializeFunctionCallArguments(
    message: FunctionCallMessage,
    ctx?: Context
): string {
    const serializer =
        ctx?.argumentSerializersByFunctionName?.[message.functionCall.name];

    const defaultSerialize = (args: string) => {
        const parsedJson = tryParseJson(args);
        if (parsedJson && ctx?.serializeAsYaml) {
            return {
                code: dump(parsedJson, { indent: 2 }).trim(),
                language: 'yaml',
            };
        } else if (parsedJson) {
            return {
                code: args,
                language: 'json',
            };
        } else {
            return {
                code: args,
            };
        }
    };

    const serialize = serializer
        ? serializer.serializeArgument
        : defaultSerialize;

    return formatFencedCodeBlock(
        serialize(message.functionCall.arguments, defaultSerialize)
    );
}

function serializeToolCall(
    toolCall: ToolCallsMessage['toolCalls'][number],
    ctx?: Context
): string {
    const serializer =
        ctx?.argumentSerializersByFunctionName?.[toolCall.function.name];

    const attributes = [
        '>',
        serializeAttribute({ key: 'id', value: toolCall.id }),
        serializeAttribute({ key: 'name', value: toolCall.function.name }),
    ].join(' ');

    const defaultSerialize = (args: string) => {
        const parsedJson = tryParseJson(args);
        if (parsedJson && ctx?.serializeAsYaml) {
            return {
                code: dump(parsedJson, { indent: 2 }).trim(),
                language: 'yaml',
            };
        } else if (parsedJson) {
            return {
                code: args,
                language: 'json',
            };
        } else {
            return {
                code: args,
            };
        }
    };

    const serialize = serializer
        ? serializer.serializeArgument
        : defaultSerialize;

    const body = () => {
        return formatFencedCodeBlock(
            serialize(toolCall.function.arguments, defaultSerialize)
        );
    };

    return [attributes, body()].join('\n\n');
}

function serializeToolCalls(message: ToolCallsMessage, ctx?: Context): string {
    return message.toolCalls
        .map((tool) => serializeToolCall(tool, ctx))
        .join('\n\n');
}

export function serializeMessage(
    message: Message,
    ctxParam: Context = defaultCtx
): string {
    const ctx = {
        ...defaultCtx,
        ...ctxParam,
    };
    if ('functionCall' in message) {
        return serializeMessageWithAttributes({
            attributes: {
                role: message.role,
                name: message.functionCall.name,
            },
            contents: serializeFunctionCallArguments(message, ctx),
        });
    } else if ('toolCalls' in message) {
        return serializeMessageWithAttributes({
            attributes: {
                role: message.role,
            },
            contents: serializeToolCalls(message, ctx),
        });
    } else if (message.role === 'function') {
        return serializeMessageWithAttributes({
            attributes: {
                role: message.role,
                name: message.name,
            },
            contents: serializeFunctionCallResult(message, ctx),
        });
    } else if (message.role === 'tool') {
        const fn = ctx.messages
            ?.flatMap((m) => ('toolCalls' in m ? m.toolCalls : []))
            .find((tool) => tool.id === message.toolCallId)?.function;

        return serializeMessageWithAttributes({
            attributes: {
                role: message.role,
                id: message.toolCallId,
                ...(fn && {
                    name: fn.name,
                }),
            },
            contents: serializeToolCallResult(message, {
                ...ctx,
                fn,
            }),
        });
    } else {
        return serializeMessageWithAttributes({
            attributes: {
                role: message.role,
            },
            contents: message.content,
        });
    }
}

const oneAttribute = /(^>)?\s*@([a-zA-Z0-9_-]+)\s*([^@]+)\s*/gm;

const parseAttributes = (lines: string) => {
    return lines
        .split('\n')
        .map((line) => {
            if (!line.startsWith('> @')) {
                // attributes must start on a new line and
                // must not contain any other content before
                // the first attribute starts
                return [];
            }

            const attributes: Array<{ key: string; value: string }> = [];

            let match = oneAttribute.exec(line);
            do {
                if (match && match[2] && match[3]) {
                    attributes.push({
                        key: match[2].trim(),
                        value: match[3].trim(),
                    });
                }
                match = oneAttribute.exec(line);
            } while (match);

            return attributes;
        })
        .filter((attrs) => attrs.length > 0)
        .map((attrs) =>
            Object.fromEntries(attrs.map((attr) => [attr.key, attr.value]))
        );
};

const removeComments = (message: string) =>
    message.replaceAll(/^>.*$/gm, '').trim();

const roleSchema = z.enum(['assistant', 'user', 'function', 'tool', 'system']);

const laxAttributesSchema = z
    .object({
        role: roleSchema.optional(),
        name: z.string().optional(),
        id: z.string().optional(),
    })
    .passthrough();

const toolCallAttributesSchema = z
    .object({
        id: z.string(),
        name: z.string(),
    })
    .passthrough();

const guessRole = (
    parsedRole: MessageRole | 'function' | 'tool' | undefined,
    previousRole: MessageRole | 'function' | 'tool' | undefined,
    index: number
): MessageRole | 'function' | 'tool' => {
    if (parsedRole) {
        return parsedRole;
    }
    if (previousRole === 'system') {
        return 'user';
    }
    if (previousRole === 'assistant') {
        return 'user';
    }
    if (previousRole === 'user') {
        return 'assistant';
    }
    if (previousRole === 'function') {
        return 'assistant';
    }
    if (previousRole === 'tool') {
        return 'assistant';
    }
    const result = (['user', 'assistant'] as const)[index % 2];
    return result as NonNullable<typeof result>;
};

function deserializeFunctionArguments(
    opts: {
        name: string;
        code: string;
        language?: string;
    },
    ctx?: Context
): string {
    const serializer = ctx?.argumentSerializersByFunctionName?.[opts.name];

    const defaultDeserialize = (serialized: string) => {
        if (opts.language === 'json') {
            return serialized.trim();
        } else if (opts.language === 'yaml') {
            const yaml = load(serialized);
            return JSON.stringify(yaml, undefined, 2);
        } else {
            return serialized.trim();
        }
    };

    const deserialize = serializer
        ? serializer.deserializeArgument
        : defaultDeserialize;

    return deserialize(opts.code, defaultDeserialize);
}

function deserializeFunctionResult(
    opts: {
        name?: string;
        id?: string;
        code: string;
        language?: string;
    },
    ctx?: Context
): string {
    const fn = opts.id
        ? ctx?.messages
              ?.flatMap((m) => ('toolCalls' in m ? m.toolCalls : []))
              .find((tool) => tool.id === opts.id)?.function
        : undefined;

    const serializer =
        ctx?.resultSerializersByFunctionName?.[opts.name ?? fn?.name ?? ''];

    const defaultDeserialize = (serialized: string) => {
        if (opts.language === 'text') {
            return JSON.stringify(serialized.trim(), undefined, 2);
        } else if (opts.language === 'json') {
            return serialized.trim();
        } else if (opts.language === 'yaml') {
            const yaml = load(serialized);
            return JSON.stringify(yaml, undefined, 2);
        } else {
            return serialized.trim();
        }
    };

    const deserialize = serializer
        ? serializer.deserializeResult
        : defaultDeserialize;

    return deserialize(opts.code, defaultDeserialize);
}

export function deserializeMessage(
    slice: string,
    ctxParam: Context & {
        previousRole?: MessageRole | 'function' | 'tool';
        index?: number;
    } = defaultCtx
): Message {
    const ctx = {
        ...defaultCtx,
        ...ctxParam,
    };
    const attrSets = parseAttributes(slice);

    const parsedAttrs =
        attrSets.length > 0
            ? laxAttributesSchema.parse(attrSets[0])
            : undefined;

    const content = removeComments(slice);

    const role = guessRole(parsedAttrs?.role, ctx.previousRole, ctx.index ?? 0);

    if (role === 'assistant') {
        const blocks = parseFencedCodeBlocks(content);

        if (parsedAttrs?.name) {
            const codeBlocks = ensureHasOneElement(blocks);
            return {
                role: 'assistant' as const,
                functionCall: {
                    name: parsedAttrs.name,
                    arguments: deserializeFunctionArguments(
                        {
                            name: parsedAttrs.name,
                            code: codeBlocks[0].code,
                            language: codeBlocks[0].language,
                        },
                        ctx
                    ),
                },
            };
        }

        if (blocks.length > 0 && attrSets.length - 1 === blocks.length) {
            return {
                role: 'assistant' as const,
                toolCalls: attrSets.slice(1).map((attrs, i) => {
                    const parsedAttrs = toolCallAttributesSchema.parse(attrs);
                    const block = ensureTruthy(blocks[i]);
                    return {
                        id: parsedAttrs.id,
                        type: 'function',
                        function: {
                            name: parsedAttrs.name,
                            arguments: deserializeFunctionArguments(
                                {
                                    name: parsedAttrs.name,
                                    code: block.code,
                                    language: block.language,
                                },
                                ctx
                            ),
                        },
                    };
                }),
            };
        }
    }

    if (role === 'function') {
        const name = ensureTruthy(parsedAttrs?.name);
        const blocks = ensureHasOneElement(parseFencedCodeBlocks(content));
        return {
            role: 'function' as const,
            name,
            content: deserializeFunctionResult(
                {
                    name,
                    code: blocks[0].code,
                    language: blocks[0].language,
                },
                ctx
            ),
        };
    }

    if (role === 'tool') {
        const id = ensureTruthy(parsedAttrs?.id);
        const blocks = ensureHasOneElement(parseFencedCodeBlocks(content));
        return {
            role: 'tool' as const,
            toolCallId: id,
            content: deserializeFunctionResult(
                {
                    id,
                    code: blocks[0].code,
                    language: blocks[0].language,
                },
                ctx
            ),
        };
    }

    return {
        role,
        content,
    };
}

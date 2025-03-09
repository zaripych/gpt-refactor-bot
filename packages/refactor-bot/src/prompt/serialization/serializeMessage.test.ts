import { expect, it } from '@jest/globals';

import { markdown } from '../../markdown/markdown';
import { deserializeMessage, serializeMessage } from './serializeMessage';

const roundtrip = (...args: Parameters<typeof serializeMessage>) => {
    return deserializeMessage(serializeMessage(...args), args[1]);
};

it('can serialize regular message', () => {
    expect(
        serializeMessage({
            role: 'user',
            content: 'hello',
        })
    ).toEqual(markdown`
        > @role user

        hello
    `);

    expect(
        roundtrip({
            role: 'user',
            content: 'hello',
        })
    ).toEqual({
        role: 'user',
        content: 'hello',
    });
});

it('can serialize system message', () => {
    expect(
        serializeMessage({
            role: 'system',
            content: 'hello',
        })
    ).toEqual(markdown`
        > @role system

        hello
    `);

    expect(
        roundtrip({
            role: 'system',
            content: 'hello',
        })
    ).toEqual({
        role: 'system',
        content: 'hello',
    });
});

it('can serialize user message', () => {
    expect(
        serializeMessage({
            role: 'user',
            content: 'hello',
        })
    ).toEqual(markdown`
        > @role user

        hello
    `);

    expect(
        roundtrip({
            role: 'user',
            content: 'hello',
        })
    ).toEqual({
        role: 'user',
        content: 'hello',
    });
});

it('can serialize multi-line user message', () => {
    expect(
        serializeMessage({
            role: 'user',
            // prettier-ignore
            content: markdown`
                This should be wrapped to multiple lines by the prettier because
                it is too long.
            `,
        })
    ).toEqual(
        // prettier-ignore
        markdown`
            > @role user

            This should be wrapped to multiple lines by the prettier because
            it is too long.
        `
    );

    expect(
        roundtrip({
            role: 'user',
            // prettier-ignore
            content: markdown`
                This should be wrapped to multiple lines by the prettier because
                it is too long.
            `,
        })
    ).toEqual({
        role: 'user',
        // prettier-ignore
        content: markdown`
            This should be wrapped to multiple lines by the prettier because
            it is too long.
        `,
    });
});

it('can serialize function call message', () => {
    expect(
        serializeMessage({
            role: 'assistant',
            functionCall: {
                name: 'add',
                arguments: JSON.stringify([1, 2], undefined, 2),
            },
        })
    ).toEqual(
        // prettier-ignore
        markdown`
            > @role assistant @name add

            \`\`\`yaml
            - 1
            - 2
            \`\`\`
        `
    );

    expect(
        roundtrip({
            role: 'assistant',
            functionCall: {
                name: 'add',
                arguments: JSON.stringify([1, 2], undefined, 2),
            },
        })
    ).toEqual({
        role: 'assistant',
        functionCall: {
            name: 'add',
            arguments: JSON.stringify([1, 2], undefined, 2),
        },
    });
});

it('can serialize tool call message', () => {
    expect(
        serializeMessage({
            role: 'assistant',
            toolCalls: [
                {
                    id: 'aaa1',
                    type: 'function',
                    function: {
                        name: 'add',
                        arguments: JSON.stringify([1, 2], undefined, 2),
                    },
                },
            ],
        })
    ).toEqual(
        // prettier-ignore
        markdown`
            > @role assistant

            > @id aaa1 @name add

            \`\`\`yaml
            - 1
            - 2
            \`\`\`
        `
    );

    expect(
        roundtrip({
            role: 'assistant',
            toolCalls: [
                {
                    id: 'aaa1',
                    type: 'function',
                    function: {
                        name: 'add',
                        arguments: JSON.stringify([1, 2], undefined, 2),
                    },
                },
            ],
        })
    ).toEqual({
        role: 'assistant',
        toolCalls: [
            {
                id: 'aaa1',
                type: 'function',
                function: {
                    name: 'add',
                    arguments: JSON.stringify([1, 2], undefined, 2),
                },
            },
        ],
    });
});

it('can serialize multiple tool call messages', () => {
    expect(
        serializeMessage({
            role: 'assistant',
            toolCalls: [
                {
                    id: 'aaa1',
                    type: 'function',
                    function: {
                        name: 'add',
                        arguments: JSON.stringify([1, 2], undefined, 2),
                    },
                },
                {
                    id: 'bbb1',
                    type: 'function',
                    function: {
                        name: 'search',
                        arguments: JSON.stringify('text', undefined, 2),
                    },
                },
            ],
        })
    ).toEqual(
        // prettier-ignore
        markdown`
            > @role assistant

            > @id aaa1 @name add

            \`\`\`yaml
            - 1
            - 2
            \`\`\`

            > @id bbb1 @name search

            \`\`\`yaml
            text
            \`\`\`
        `
    );

    expect(
        roundtrip({
            role: 'assistant',
            toolCalls: [
                {
                    id: 'aaa1',
                    type: 'function',
                    function: {
                        name: 'add',
                        arguments: JSON.stringify([1, 2], undefined, 2),
                    },
                },
                {
                    id: 'bbb1',
                    type: 'function',
                    function: {
                        name: 'search',
                        arguments: JSON.stringify('text', undefined, 2),
                    },
                },
            ],
        })
    ).toEqual({
        role: 'assistant',
        toolCalls: [
            {
                id: 'aaa1',
                type: 'function',
                function: {
                    name: 'add',
                    arguments: JSON.stringify([1, 2], undefined, 2),
                },
            },
            {
                id: 'bbb1',
                type: 'function',
                function: {
                    name: 'search',
                    arguments: JSON.stringify('text', undefined, 2),
                },
            },
        ],
    });
});

it('can serialize function call result', () => {
    expect(
        serializeMessage({
            role: 'function',
            content: '{"result": 3}',
            name: 'add',
        })
    ).toEqual(
        // prettier-ignore
        markdown`
            > @role function @name add

            \`\`\`yaml
            result: 3
            \`\`\`
        `
    );

    expect(
        roundtrip({
            role: 'function',
            content: JSON.stringify({ result: 3 }),
            name: 'add',
        })
    ).toEqual({
        role: 'function',
        content: JSON.stringify({ result: 3 }, undefined, 2),
        name: 'add',
    });
});

it('can serialize tool call result', () => {
    expect(
        serializeMessage({
            role: 'tool',
            toolCallId: 'aaa1',
            content: '{"result": 3}',
        })
    ).toEqual(
        // prettier-ignore
        markdown`
            > @role tool @id aaa1

            \`\`\`yaml
            result: 3
            \`\`\`
        `
    );

    expect(
        roundtrip({
            role: 'tool',
            toolCallId: 'aaa1',
            content: JSON.stringify({ result: 3 }),
        })
    ).toEqual({
        role: 'tool',
        toolCallId: 'aaa1',
        content: JSON.stringify({ result: 3 }, undefined, 2),
    });
});

it('can serialize string function call result', () => {
    expect(
        serializeMessage({
            role: 'function',
            name: 'add',
            content: '"result is text"',
        })
    ).toEqual(
        // prettier-ignore
        markdown`
            > @role function @name add

            \`\`\`text
            result is text
            \`\`\`
        `
    );

    expect(
        roundtrip({
            role: 'function',
            name: 'add',
            content: '"result is text"',
        })
    ).toEqual({
        role: 'function',
        name: 'add',
        content: '"result is text"',
    });
});

it('can serialize string tool call result', () => {
    expect(
        serializeMessage({
            role: 'tool',
            toolCallId: 'aaa1',
            content: '"result is text"',
        })
    ).toEqual(
        // prettier-ignore
        markdown`
            > @role tool @id aaa1

            \`\`\`text
            result is text
            \`\`\`
        `
    );

    expect(
        roundtrip({
            role: 'tool',
            toolCallId: 'aaa1',
            content: JSON.stringify('result is text'),
        })
    ).toEqual({
        role: 'tool',
        toolCallId: 'aaa1',
        content: JSON.stringify('result is text', undefined, 2),
    });
});

it('adds name of the tool, if it is available in the context', () => {
    expect(
        serializeMessage(
            {
                role: 'tool',
                toolCallId: 'aaa1',
                content: '{"result": 3}',
            },
            {
                messages: [
                    {
                        role: 'assistant',
                        toolCalls: [
                            {
                                id: 'aaa1',
                                type: 'function',
                                function: {
                                    name: 'add',
                                    arguments: JSON.stringify(
                                        [1, 2],
                                        undefined,
                                        2
                                    ),
                                },
                            },
                        ],
                    },
                ],
            }
        )
    ).toEqual(
        // prettier-ignore
        markdown`
            > @role tool @id aaa1 @name add

            \`\`\`yaml
            result: 3
            \`\`\`
        `
    );

    expect(
        roundtrip(
            {
                role: 'tool',
                toolCallId: 'aaa1',
                content: JSON.stringify({ result: 3 }),
            },
            {
                messages: [
                    {
                        role: 'assistant',
                        toolCalls: [
                            {
                                id: 'aaa1',
                                type: 'function',
                                function: {
                                    name: 'add',
                                    arguments: JSON.stringify(
                                        [1, 2],
                                        undefined,
                                        2
                                    ),
                                },
                            },
                        ],
                    },
                ],
            }
        )
    ).toEqual({
        role: 'tool',
        toolCallId: 'aaa1',
        content: JSON.stringify({ result: 3 }, undefined, 2),
    });
});

it('can override serialization of a tool call argument', () => {
    expect(
        serializeMessage(
            {
                role: 'assistant',
                toolCalls: [
                    {
                        id: 'aaa1',
                        type: 'function',
                        function: {
                            name: 'add',
                            arguments: JSON.stringify([1, 2], undefined, 2),
                        },
                    },
                ],
            },
            {
                argumentSerializersByFunctionName: {
                    add: {
                        serializeArgument: (args) => ({
                            code: (JSON.parse(args) as number[]).join(' + '),
                        }),
                        deserializeArgument: (serialized) =>
                            JSON.stringify(
                                serialized.split(' + ').map(Number),
                                undefined,
                                2
                            ),
                    },
                },
            }
        )
    ).toEqual(
        // prettier-ignore
        markdown`
            > @role assistant

            > @id aaa1 @name add

            \`\`\`
            1 + 2
            \`\`\`
        `
    );

    expect(
        roundtrip(
            {
                role: 'assistant',
                toolCalls: [
                    {
                        id: 'aaa1',
                        type: 'function',
                        function: {
                            name: 'add',
                            arguments: JSON.stringify([1, 2], undefined, 2),
                        },
                    },
                ],
            },
            {
                argumentSerializersByFunctionName: {
                    add: {
                        serializeArgument: (args) => ({
                            code: (JSON.parse(args) as number[]).join(' + '),
                        }),
                        deserializeArgument: (serialized) =>
                            JSON.stringify(
                                serialized.split(' + ').map(Number),
                                undefined,
                                2
                            ),
                    },
                },
            }
        )
    ).toEqual({
        role: 'assistant',
        toolCalls: [
            {
                id: 'aaa1',
                type: 'function',
                function: {
                    name: 'add',
                    arguments: JSON.stringify([1, 2], undefined, 2),
                },
            },
        ],
    });
});

it('can override serialization of a function call argument', () => {
    expect(
        serializeMessage(
            {
                role: 'assistant',
                functionCall: {
                    name: 'add',
                    arguments: JSON.stringify([1, 2], undefined, 2),
                },
            },
            {
                argumentSerializersByFunctionName: {
                    add: {
                        serializeArgument: (args) => ({
                            code: (JSON.parse(args) as number[]).join(' + '),
                        }),
                        deserializeArgument: (serialized) =>
                            JSON.stringify(
                                serialized.split(' + ').map(Number),
                                undefined,
                                2
                            ),
                    },
                },
            }
        )
    ).toEqual(
        // prettier-ignore
        markdown`
            > @role assistant @name add

            \`\`\`
            1 + 2
            \`\`\`
        `
    );

    expect(
        roundtrip(
            {
                role: 'assistant',
                functionCall: {
                    name: 'add',
                    arguments: JSON.stringify([1, 2], undefined, 2),
                },
            },
            {
                argumentSerializersByFunctionName: {
                    add: {
                        serializeArgument: (args) => ({
                            code: (JSON.parse(args) as number[]).join(' + '),
                        }),
                        deserializeArgument: (serialized) =>
                            JSON.stringify(
                                serialized.split(' + ').map(Number),
                                undefined,
                                2
                            ),
                    },
                },
            }
        )
    ).toEqual({
        role: 'assistant',
        functionCall: {
            name: 'add',
            arguments: JSON.stringify([1, 2], undefined, 2),
        },
    });
});

it('can deserialize empty message', () => {
    expect(deserializeMessage('')).toEqual({
        role: 'user',
        content: '',
    });
});

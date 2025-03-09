import { expect, it } from '@jest/globals';
import dedent from 'dedent';

import { serializeMessage } from './serializeMessage';

it('should serialize readFile results nicely', () => {
    expect(
        serializeMessage(
            {
                role: 'function',
                name: 'readFile',
                content: JSON.stringify(`console.log('Hello, world!');\n`),
            },
            {
                messages: [
                    {
                        role: 'assistant',
                        functionCall: {
                            arguments: JSON.stringify(
                                {
                                    filePath: 'test.js',
                                },
                                undefined,
                                2
                            ),
                            name: 'readFile',
                        },
                    },
                ],
            }
        )
    ).toBe(dedent`
        > @role function @name readFile

        <!-- prettier-ignore -->
        \`\`\`javascript
        console.log('Hello, world!');

        \`\`\`
    `);
});

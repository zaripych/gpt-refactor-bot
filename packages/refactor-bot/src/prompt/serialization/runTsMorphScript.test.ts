import { expect, it } from '@jest/globals';
import dedent from 'dedent';

import { serializeMessage } from './serializeMessage';

it('should serialize runTsMorphScript calls nicely', () => {
    expect(
        serializeMessage({
            role: 'assistant',
            functionCall: {
                arguments: JSON.stringify(
                    {
                        code: "console.log('Hello, world!');",
                    },
                    undefined,
                    2
                ),
                name: 'runTsMorphScript',
            },
        })
    ).toBe(dedent`
        > @role assistant @name runTsMorphScript

        \`\`\`typescript
        console.log('Hello, world!');
        \`\`\`
    `);
});

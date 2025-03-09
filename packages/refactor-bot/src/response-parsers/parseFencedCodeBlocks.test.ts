import { expect, it } from '@jest/globals';
import dedent from 'dedent';

import { markdown } from '../markdown/markdown';
import { parseFencedCodeBlocks } from './parseFencedCodeBlocks';

it('should return empty array when no blocks', () => {
    expect(parseFencedCodeBlocks(`Hello world`)).toEqual([]);
});

it('should parse single block', () => {
    expect(
        parseFencedCodeBlocks(markdown`
            ~~~TypeScript
              // some code
            ~~~
        `)
    ).toEqual([
        {
            block: markdown`
                ~~~TypeScript
                  // some code
                ~~~
            `,
            code: `  // some code`,
            language: 'TypeScript',
            marker: '~~~',
            start: 0,
        },
    ]);
});

it('should parse single block surrounded by md', () => {
    expect(
        parseFencedCodeBlocks(markdown`
            # Title

            Preceding text

            ~~~TypeScript
              // some code
            ~~~

            Some text after
        `)
    ).toEqual([
        {
            block: markdown`
                ~~~TypeScript
                  // some code
                ~~~
            `,
            code: `  // some code`,
            language: 'TypeScript',
            marker: '~~~',
            start: 25,
        },
    ]);
});

it('should be allowed without language tag', () => {
    expect(
        parseFencedCodeBlocks(markdown`
            ~~~
            unknown language
            ~~~
        `)
    ).toEqual([
        {
            block: markdown`
                ~~~
                unknown language
                ~~~
            `,
            code: 'unknown language',
            marker: '~~~',
            start: 0,
        },
    ]);
});

it('should allow empty code block', () => {
    expect(
        parseFencedCodeBlocks(dedent`
            ~~~txt
            ~~~
        `)
    ).toEqual([
        {
            block: dedent`
                ~~~txt
                ~~~
            `,
            code: '',
            language: 'txt',
            marker: '~~~',
            start: 0,
        },
    ]);
});

it('should parse backtick block', () => {
    expect(
        parseFencedCodeBlocks(dedent`
            \`\`\`md
            Hello!
            \`\`\`
        `)
    ).toEqual([
        {
            block: dedent`
                \`\`\`md
                Hello!
                \`\`\`
            `,
            code: `Hello!`,
            language: 'md',
            marker: '```',
            start: 0,
        },
    ]);
});

it('should parse multiple blocks', () => {
    expect(
        parseFencedCodeBlocks(dedent`
            Confirm the file is there:
            \`\`\`sh
            ls .
            \`\`\`

            Then execute:
            \`\`\`sh
            cat file.txt
            \`\`\`
        `)
    ).toEqual([
        {
            block: dedent`
                \`\`\`sh
                ls .
                \`\`\`
            `,
            code: `ls .`,
            language: 'sh',
            marker: '```',
            start: 27,
        },
        {
            block: dedent`
                \`\`\`sh
                cat file.txt
                \`\`\`
            `,
            code: `cat file.txt`,
            language: 'sh',
            marker: '```',
            start: 57,
        },
    ]);
});

it('should parse multiple blocks with different markers', () => {
    expect(
        parseFencedCodeBlocks(dedent`
            Confirm the file is there:
            \`\`\`sh
            ls .
            \`\`\`

            Then execute:
            ~~~sh
            cat file.txt
            ~~~
        `)
    ).toEqual([
        {
            block: dedent`
                \`\`\`sh
                ls .
                \`\`\`
            `,
            code: `ls .`,
            language: 'sh',
            marker: '```',
            start: 27,
        },
        {
            block: dedent`
                ~~~sh
                cat file.txt
                ~~~
            `,
            code: `cat file.txt`,
            language: 'sh',
            marker: '~~~',
            start: 57,
        },
    ]);
});

it('should not trigger internal code blocks', () => {
    expect(
        parseFencedCodeBlocks(markdown`
            ~~~TypeScript
            const value = /* yaml */\`
                \`\`\`TypeScript
                  // some code
                \`\`\`
            \`

            ~~~
        `)
    ).toEqual([
        {
            block: markdown`
                ~~~TypeScript
                const value = /* yaml */\`
                    \`\`\`TypeScript
                      // some code
                    \`\`\`
                \`

                ~~~
            `,
            code: dedent/* ts */ `
                const value = /* yaml */\`
                    \`\`\`TypeScript
                      // some code
                    \`\`\`
                \`\n
            `,
            language: 'TypeScript',
            marker: '~~~',
            start: 0,
        },
    ]);
});

it('should not trigger other internal code blocks on the same level', () => {
    expect(
        parseFencedCodeBlocks(dedent`
            ~~~~TypeScript
            const value = /* ts */\`
            ~~~TypeScript
            // some code
            ~~~
            \`
            ~~~~
        `)
    ).toEqual([
        {
            block: dedent`
                ~~~~TypeScript
                const value = /* ts */\`
                ~~~TypeScript
                // some code
                ~~~
                \`
                ~~~~
            `,
            code: dedent`
                const value = /* ts */\`
                ~~~TypeScript
                // some code
                ~~~
                \`
            `,
            language: 'TypeScript',
            marker: '~~~~',
            start: 0,
        },
    ]);
});

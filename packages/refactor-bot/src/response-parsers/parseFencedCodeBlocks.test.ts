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
            code: `  // some code\n`,
            language: 'TypeScript',
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
            code: 'unknown language\n',
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
            code: '',
            language: 'txt',
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
            code: `Hello!\n`,
            language: 'md',
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
            code: `ls .\n`,
            language: 'sh',
        },
        {
            code: `cat file.txt\n`,
            language: 'sh',
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
            code: dedent/* ts */ `
                const value = /* yaml */\`
                    \`\`\`TypeScript
                      // some code
                    \`\`\`
                \`\n
            `,
            language: 'TypeScript',
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
            code: dedent`
                const value = /* ts */\`
                ~~~TypeScript
                // some code
                ~~~
                \`\n
            `,
            language: 'TypeScript',
        },
    ]);
});

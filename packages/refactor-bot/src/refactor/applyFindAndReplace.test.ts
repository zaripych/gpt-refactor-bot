import { expect, it } from '@jest/globals';
import dedent from 'dedent';

import { applyFindAndReplace } from './applyFindAndReplace';

it(`should work when no changes`, () => {
    expect(
        applyFindAndReplace({
            text: dedent`
                // first line of code in the file
                1
                2
                3
                4
                5
                6
                // last line of code in the file
            `,
            blocks: [
                {
                    find: dedent`
                        1
                        2
                        3
                        4
                        5
                        6
                    `,
                    replace: dedent`
                        1
                        2
                        3
                        4
                        5
                        6
                    `,
                },
            ],
        })
    ).toBe(dedent`
        // first line of code in the file
        1
        2
        3
        4
        5
        6
        // last line of code in the file
    `);
});

it(`should apply in the middle`, () => {
    expect(
        applyFindAndReplace({
            text: dedent`
                // first line of code in the file
                1
                2
                3
                4
                5
                6
                // last line of code in the file
            `,
            blocks: [
                {
                    find: dedent`
                        1
                        2
                        3
                        4
                    `,
                    replace: dedent`
                        1
                        2+1
                        3+1
                        4
                    `,
                },
            ],
        })
    ).toBe(dedent`
        // first line of code in the file
        1
        2+1
        3+1
        4
        5
        6
        // last line of code in the file
    `);
});

it(`should apply in the beginning`, () => {
    expect(
        applyFindAndReplace({
            text: dedent`
                // first line of code in the file
                1
                2
                3
                4
                5
                6
                // last line of code in the file
            `,
            blocks: [
                {
                    find: dedent`
                        // first line of code in the file
                        1
                        2
                        3
                    `,
                    replace: dedent`
                        // first line of code in the file
                        1+1
                        2+1
                        3
                    `,
                },
            ],
        })
    ).toBe(dedent`
        // first line of code in the file
        1+1
        2+1
        3
        4
        5
        6
        // last line of code in the file
    `);
});

it(`should apply in the end`, () => {
    expect(
        applyFindAndReplace({
            text: dedent`
                // first line of code in the file
                1
                2
                3
                4
                5
                6
                // last line of code in the file
            `,
            blocks: [
                {
                    find: dedent`
                        4
                        5
                        6
                        // last line of code in the file
                    `,
                    replace: dedent`
                        4
                        5+1
                        6+1
                        7+1
                        // last line of code in the file
                    `,
                },
            ],
        })
    ).toBe(dedent`
        // first line of code in the file
        1
        2
        3
        4
        5+1
        6+1
        7+1
        // last line of code in the file
    `);
});

it(`should complain if first line cannot be found`, () => {
    expect(() =>
        applyFindAndReplace({
            text: dedent`
                // first line of code in the file
                1
                2
                3
                4
                5
                6
                // last line of code in the file
            `,
            blocks: [
                {
                    find: dedent`
                        // this line cannot be found
                    `,
                    replace: ``,
                },
            ],
        })
    ).toThrow(dedent`
        Could not find the text in the file:
    `);
});

it(`should complain if line is pure whitespace`, () => {
    expect(() =>
        applyFindAndReplace({
            text: dedent`
                // first line of code in the file
                1
                \t\t
                3
                4
                5
                6
                // last line of code in the file
            `,
            blocks: [
                {
                    find: `\t\t`,
                    replace: ``,
                },
            ],
        })
    ).toThrow(dedent`
        \`"find"\` must not be just whitespace
    `);
});

it(`should replace first occurrence if find is ambiguous`, () => {
    expect(
        applyFindAndReplace({
            text: dedent`
                // first line of code in the file
                1111
                2
                3
                4
                1111
                5
                6
                // last line of code in the file
            `,
            blocks: [
                {
                    find: `1111`,
                    replace: `1111+1`,
                },
            ],
        })
    ).toEqual(dedent`
        // first line of code in the file
        1111+1
        2
        3
        4
        1111
        5
        6
        // last line of code in the file
    `);
});

it(`should replace via occurrence`, () => {
    expect(
        applyFindAndReplace({
            text: dedent`
                // first line of code in the file
                1111
                2
                3
                4
                1111
                5
                6
                // last line of code in the file
            `,
            blocks: [
                {
                    find: `1111`,
                    occurrence: 0,
                    replace: `1111+1`,
                },
            ],
        })
    ).toEqual(dedent`
        // first line of code in the file
        1111+1
        2
        3
        4
        1111
        5
        6
        // last line of code in the file
    `);
});

it(`should replace via occurrence`, () => {
    expect(
        applyFindAndReplace({
            text: dedent`
                // first line of code in the file
                1111
                2
                3
                4
                1111
                5
                6
                // last line of code in the file
            `,
            blocks: [
                {
                    find: `1111`,
                    occurrence: 1,
                    replace: `1111+1`,
                },
            ],
        })
    ).toEqual(dedent`
        // first line of code in the file
        1111
        2
        3
        4
        1111+1
        5
        6
        // last line of code in the file
    `);
});

it(`should replace all occurrences`, () => {
    expect(
        applyFindAndReplace({
            text: dedent`
                // first line of code in the file
                1111
                2
                3
                4
                1111
                5
                6
                // last line of code in the file
            `,
            blocks: [
                {
                    findAll: `1111`,
                    replace: `1111+1`,
                },
            ],
        })
    ).toEqual(dedent`
        // first line of code in the file
        1111+1
        2
        3
        4
        1111+1
        5
        6
        // last line of code in the file
    `);
});

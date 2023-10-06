import { expect, it, jest } from '@jest/globals';

import { findRefactorBotPackageRoot } from '../file-system/findRefactorBotPackageRoot';
import { prettierMarkdown, prettierTypescript } from './prettier';

it('works for md', async () => {
    expect(
        await prettierMarkdown({
            repositoryRoot: findRefactorBotPackageRoot(),
            md: `#  Hello world

This is a test`,
        })
    ).toBe(`# Hello world

This is a test
`);
});

it('works for typescript', async () => {
    expect(
        await prettierTypescript({
            repositoryRoot: findRefactorBotPackageRoot(),
            ts: `export const hello =  "world";`,
        })
    ).toBe(`export const hello = 'world';
`);
});

it('works for gibberish', async () => {
    const warn = jest.fn();
    expect(
        await prettierTypescript(
            {
                repositoryRoot: findRefactorBotPackageRoot(),
                ts: `std::string hello =  "world";`,
            },
            {
                warn,
            }
        )
    ).toBe(`std::string hello =  "world";`);
});

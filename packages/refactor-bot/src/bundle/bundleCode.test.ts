import { expect, it } from '@jest/globals';
import dedent from 'dedent';

import { bundleCode } from './bundleCode';
import { ImportNotAllowedError } from './importNotAllowedError';

it('when bundling a bundle, should not allow importing', async () => {
    await expect(
        bundleCode({
            code: dedent/* ts */ `
                import "node:util"
            `,
            allowedDynamicImports: [],
            allowedImports: [],
            moduleName: 'main.ts',
        })
    ).rejects.toThrowError(ImportNotAllowedError);
});

it('when bundling a bundle, should not allow dynamic importing', async () => {
    await expect(
        bundleCode({
            code: dedent/* ts */ `
                await import("node:util")
            `,
            allowedDynamicImports: ['ts-morph'],
            allowedImports: [],
            moduleName: 'main.ts',
        })
    ).rejects.toThrowError(ImportNotAllowedError);
});

it('when bundling a bundle, should allow importing', async () => {
    await expect(
        bundleCode({
            code: dedent/* ts */ `
                import "ts-morph"
            `,
            allowedDynamicImports: [],
            allowedImports: ['ts-morph'],
            moduleName: 'main.ts',
        })
    ).resolves.toEqual(
        expect.objectContaining({
            code: expect.anything(),
            exports: [],
        })
    );
});

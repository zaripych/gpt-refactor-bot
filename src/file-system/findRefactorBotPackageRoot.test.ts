import { expect, it } from '@jest/globals';

import { findRefactorBotPackageRoot } from './findRefactorBotPackageRoot';

it('should work', () => {
    expect(
        findRefactorBotPackageRoot(
            `file:///Users/dude/project/src/file-system/findRefactorBotPackageRoot.ts`
        )
    ).toBe('/Users/dude/project');
    expect(
        findRefactorBotPackageRoot(
            'file:///home/dir/refactor-bot/chunk.112233.js'
        )
    ).toBe('/home/dir/refactor-bot/');
});

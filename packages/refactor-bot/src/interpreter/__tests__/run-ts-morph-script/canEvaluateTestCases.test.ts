import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, it } from '@jest/globals';
import { globby } from 'globby';

import { startInterpreterRpc } from '../../rpc/startInterpreterRpc';

const repositoryRoot = fileURLToPath(new URL('./test-cases', import.meta.url));

const testCasesRoot = fileURLToPath(new URL('./test-cases', import.meta.url));

const caseNames = await globby('*.{ts,js}', {
    ignore: ['*.skip.ts', '*.skip.js'],
    cwd: testCasesRoot,
});

const cases = new Map(
    await Promise.all(
        caseNames.map((caseName) =>
            readFile(join(testCasesRoot, caseName), 'utf-8').then(
                (code) => [caseName, code] as const
            )
        )
    )
);

it.concurrent.each([...cases.entries()])(
    'should work for %s case',
    async (_caseName, code) => {
        const { runTsMorphScript, teardown } = await startInterpreterRpc();

        try {
            const results = await runTsMorphScript({
                args: {
                    code,
                },
                config: {
                    repositoryRoot,
                },
            });

            expect(results).toBeDefined();
        } finally {
            teardown();
        }
    }
);

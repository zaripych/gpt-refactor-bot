import fg from 'fast-glob';
import { readFile } from 'fs/promises';
import { basename, dirname } from 'path';

import { findRepositoryRoot } from '../file-system/findRepositoryRoot';
import type { RefactorConfig } from './types';

export async function loadRefactorConfigs() {
    const repoRoot = await findRepositoryRoot();

    const refactors = await fg('.refactor-bot/refactors/*/goal.md', {
        cwd: repoRoot,
        absolute: true,
    });

    return Promise.all(
        refactors.map(async (goalDescriptionFile) => {
            const goal = await readFile(goalDescriptionFile, 'utf-8');
            const baseDirectory = basename(dirname(goalDescriptionFile));
            return {
                name: baseDirectory,
                objective: goal,
                budgetCents: 10_00,
            } satisfies RefactorConfig;
        })
    );
}

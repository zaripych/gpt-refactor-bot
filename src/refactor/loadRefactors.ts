import fg from 'fast-glob';
import { readFile } from 'fs/promises';
import { load as loadYaml } from 'js-yaml';
import { basename, dirname } from 'path';
import { z } from 'zod';

import { findRepositoryRoot } from '../file-system/findRepositoryRoot';
import { refactorConfigSchema } from './types';

async function parseConfig(opts: { defaultName: string; contents: string }) {
    const configRegex = /```yaml\s*((.|\n(?!```))*)\s*```/g;
    const match = configRegex.exec(opts.contents) || [];
    const config = match[1] || '';
    const parsedConfig = await refactorConfigSchema
        .setKey('name', z.string().default(opts.defaultName))
        .setKey('objective', z.string().optional())
        .parseAsync(loadYaml(config));
    return {
        ...parsedConfig,
        objective:
            parsedConfig.objective ||
            opts.contents.replace(configRegex, '').trim(),
    };
}

export async function loadRefactorConfigs() {
    const repoRoot = await findRepositoryRoot();

    const refactors = await fg('.refactor-bot/refactors/*/goal.md', {
        cwd: repoRoot,
        absolute: true,
    });

    return Promise.all(
        refactors.map(async (goalDescriptionFile) => {
            const contents = await readFile(goalDescriptionFile, 'utf-8');
            const defaultName = basename(dirname(goalDescriptionFile));
            return await parseConfig({
                defaultName,
                contents,
            });
        })
    );
}

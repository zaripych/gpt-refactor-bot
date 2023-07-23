import { readFile } from 'fs/promises';
import { join } from 'path';
import { z } from 'zod';

import { iterateDirectoriesUp } from './iterateDirectoriesUp';

const modulesCache = new Map<
    string,
    {
        name: string;
        directory: string;
    } | null
>();

async function readPackageNameFromPackageJson(location: string) {
    try {
        const contents = await readFile(join(location, 'package.json'), 'utf8');
        const json = JSON.parse(contents) as unknown;
        const result = z.object({ name: z.string() }).safeParse(json);
        if (result.success) {
            return result.data.name;
        }
        return undefined;
    } catch (err) {
        return undefined;
    }
}

export async function findPackageName(location: string) {
    return iterateDirectoriesUp(location, async (directory) => {
        if (modulesCache.has(directory)) {
            return modulesCache.get(directory)?.name;
        }

        const name = await readPackageNameFromPackageJson(directory);

        if (name) {
            modulesCache.set(directory, {
                name,
                directory,
            });
            return name;
        }
        modulesCache.set(directory, null);

        return undefined;
    });
}

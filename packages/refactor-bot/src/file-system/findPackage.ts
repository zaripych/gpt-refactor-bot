import { readFile } from 'fs/promises';
import { join } from 'path';
import { z } from 'zod';

import { iterateDirectoriesUp } from './iterateDirectoriesUp';

const modulesCache = new Map<
    string,
    {
        packageJson: { name: string };
        directory: string;
    } | null
>();

async function readPackageJson(location: string) {
    try {
        const contents = await readFile(join(location, 'package.json'), 'utf8');
        const json = JSON.parse(contents) as unknown;
        const result = z
            .object({ name: z.string() })
            .passthrough()
            .safeParse(json);
        if (result.success) {
            return result.data;
        }
        return undefined;
    } catch (err) {
        return undefined;
    }
}

export async function findPackage(location: string) {
    return iterateDirectoriesUp(location, async (directory) => {
        const entry = modulesCache.get(directory);
        if (entry) {
            return {
                packageJson: entry.packageJson,
                packageJsonPath: join(directory, 'package.json'),
                packageDirectory: directory,
            };
        }

        const packageJson = await readPackageJson(directory);

        if (packageJson) {
            modulesCache.set(directory, {
                packageJson,
                directory,
            });
            return {
                packageJson,
                packageJsonPath: join(directory, 'package.json'),
                packageDirectory: directory,
            };
        }

        modulesCache.set(directory, null);

        return undefined;
    });
}

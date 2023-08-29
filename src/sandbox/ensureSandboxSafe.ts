import assert from 'assert';
import { readlink, realpath } from 'fs/promises';
import type { GlobEntry } from 'globby';
import { globbyStream } from 'globby';
import { isAbsolute, resolve } from 'path';

export async function ensureSandboxSafe(location: string) {
    const iterable = globbyStream('**/*', {
        cwd: location,
        dot: true,
        onlyFiles: false,
        absolute: true,
        stats: true,
        objectMode: true,
    }) as AsyncIterable<GlobEntry>;

    for await (const entry of iterable) {
        assert(entry.stats);

        if (!entry.stats.isSymbolicLink()) {
            continue;
        }

        const link = await readlink(entry.path);
        const absoluteLink = isAbsolute(link)
            ? link
            : resolve(entry.path, link);
        const path = await realpath(absoluteLink).catch(() => absoluteLink);

        assert(
            path.startsWith(location),
            `Found a symlink at "${entry.path}" that points "${path}" outside of the sandbox "${location}"`
        );
    }
}

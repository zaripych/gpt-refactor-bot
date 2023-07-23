import assert from 'assert';
import fg from 'fast-glob';
import { readlink, realpath } from 'fs/promises';
import { isAbsolute, resolve } from 'path';

export async function ensureSandboxSafe(location: string) {
    const iterable = fg.stream('**/*', {
        cwd: location,
        dot: true,
        onlyFiles: false,
        absolute: true,
    }) as AsyncIterable<fg.Entry>;

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

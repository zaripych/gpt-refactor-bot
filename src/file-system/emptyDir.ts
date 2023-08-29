import { lstat, mkdir, readdir, rm, unlink } from 'node:fs/promises';
import { join } from 'node:path';

export async function emptyDir(dir: string) {
    let items;
    try {
        items = await readdir(dir);
    } catch {
        return mkdir(dir, { recursive: true });
    }

    return Promise.all(
        items.map(async (item) => {
            const path = join(dir, item);
            const result = await lstat(path);
            if (result.isSymbolicLink()) {
                await unlink(path);
            } else if (result.isDirectory()) {
                await rm(path, { recursive: true });
            } else {
                await unlink(path);
            }
        })
    );
}

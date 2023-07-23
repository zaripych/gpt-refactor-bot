import { dirname } from 'path';

export async function iterateDirectoriesUp<R>(
    directory: string,
    test: (directory: string) => Promise<R | undefined>
): Promise<R | undefined> {
    let current = directory;
    while (current !== '/' && current !== '~/') {
        const result = await test(current);
        if (result !== undefined) {
            return result;
        }
        current = dirname(current);
    }
    return undefined;
}

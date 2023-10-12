import { dirname } from 'path';

export function ancestorDirectories(filePath: string) {
    const dirs = [];
    let current = dirname(filePath);
    while (current !== '.' && current !== '~' && current !== '/') {
        dirs.push(current);
        current = dirname(current);
    }
    return dirs;
}

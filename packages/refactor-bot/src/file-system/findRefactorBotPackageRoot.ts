import { dirname } from 'path';
import { fileURLToPath } from 'url';

export function findRefactorBotPackageRoot(importMetaUrl = import.meta.url) {
    const path = fileURLToPath(new URL('.', importMetaUrl));
    if (path.includes('src/file-system')) {
        return dirname(dirname(path));
    } else if (path.endsWith('dist/')) {
        return dirname(path);
    } else {
        return path;
    }
}

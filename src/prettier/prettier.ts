import prettierPackage from 'prettier';

import { findRepositoryRoot } from '../file-system/findRepositoryRoot';
import { onceAsync } from '../utils/onceAsync';

const loadConfig = onceAsync(async () =>
    prettierPackage.resolveConfig(await findRepositoryRoot())
);

export async function prettierMarkdown(md: string) {
    return prettierPackage.format(md, {
        parser: 'markdown',
        embeddedLanguageFormatting: 'auto',
        ...(await loadConfig()),
    });
}

export async function prettierTypescript(ts: string) {
    return prettierPackage.format(ts, {
        parser: 'typescript',
        embeddedLanguageFormatting: 'auto',
        ...(await loadConfig()),
    });
}

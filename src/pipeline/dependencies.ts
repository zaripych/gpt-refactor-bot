import { mkdir, readFile, rename, rm, unlink, writeFile } from 'fs/promises';
import { globby } from 'globby';
import { dump as dumpYaml, load as loadYaml } from 'js-yaml';
import hash from 'object-hash';

import { logger } from '../logger/logger';

export const defaultDeps = {
    logger,
    dumpYaml,
    loadYaml,
    writeFile,
    readFile,
    mkdir,
    hash: (value: unknown) => hash(value as object).substring(0, 4),
    fg: (
        patterns: string[],
        opts: {
            cwd: string;
            ignore: string[];
            onlyFiles?: boolean;
        }
    ) => {
        return globby(patterns, opts);
    },
    unlink,
    rm,
    rename,

    defaultSaveInput: true,
};

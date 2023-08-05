import fg from 'fast-glob';
import {
    mkdir,
    readdir,
    readFile,
    rename,
    unlink,
    writeFile,
} from 'fs/promises';
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
    readdir,
    fg: (
        patterns: string[],
        opts: {
            cwd: string;
            ignore: string[];
        }
    ) => {
        return fg(patterns, opts);
    },
    unlink,
    rename,
    saveInput: true,
};

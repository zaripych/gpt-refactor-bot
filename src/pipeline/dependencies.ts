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
    saveInput: true,
    saveResult: true,
    /**
     * @note I was testing whether the non-determinism of the models
     * can be used to break out of infinite loops and found it to be
     * not reliable at all. The models are not random enough. But need
     * to test this more with different temperatures and try make it
     * work with "choices".
     */
    temporary_flag_abortOnCycles: true,
};

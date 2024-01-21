import { readFile } from 'fs/promises';
import { load } from 'js-yaml';

import { ConfigurationError } from '../errors/configurationError';
import { isFileNotFoundError } from '../utils/isFileNotFoundError';
import { benchConfigSchema } from './benchmarkConfig';

export async function loadBenchmarkConfig(filePath: string) {
    try {
        const text = await readFile(filePath, 'utf-8');
        const data = load(text);
        const parsed = benchConfigSchema.parse(data);
        return parsed;
    } catch (err) {
        if (isFileNotFoundError(err)) {
            throw new ConfigurationError(`Config file not found`, {
                cause: err,
            });
        }

        throw err;
    }
}

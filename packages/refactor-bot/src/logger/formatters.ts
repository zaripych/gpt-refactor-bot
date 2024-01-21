import { relative } from 'path';

import { glowFormat } from '../markdown/glowFormat';
import type { Formatters } from './asyncFormatter';
import { formatObject } from './formatObject';

function formatLocation(input: string) {
    const cwd = process.env['LOG_RELATIVE_TO_CWD'] ?? process.cwd();
    if (input.startsWith(cwd)) {
        return relative(cwd, input);
    }
    return input;
}

function formatLocationArray(input: unknown) {
    if (Array.isArray(input)) {
        return input.map((item) =>
            typeof item === 'string' ? formatLocation(item) : (item as unknown)
        );
    } else {
        return input;
    }
}

export const formatters: Formatters = {
    objective: (input) =>
        typeof input === 'string' ? glowFormat({ input }) : input,
    err: (input) =>
        typeof input === 'object' && input !== null
            ? formatObject(input)
            : input,
    location: (input) => {
        if (typeof input === 'string') {
            return formatLocation(input);
        } else {
            return input;
        }
    },
    executionLog: (input) => formatLocationArray(input),
    resultFilePaths: (input) => formatLocationArray(input),
};

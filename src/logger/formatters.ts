import { glowFormat } from '../markdown/glowFormat';
import type { Formatters } from './asyncFormatter';
import { formatObject } from './formatObject';

export const formatters: Formatters = {
    objective: (input) =>
        typeof input === 'string' ? glowFormat({ input }) : input,
    err: (input) =>
        typeof input === 'object' && input !== null
            ? formatObject(input)
            : input,
};

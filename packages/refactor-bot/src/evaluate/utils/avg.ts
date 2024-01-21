import { sum } from './sum';

export function avg(values: number[]) {
    return sum(values) / values.length;
}

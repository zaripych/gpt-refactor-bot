import { avg } from './avg';
import { standardDeviation } from './std';

export function outliers<T>(
    data: T[],
    value: (item: T) => number,
    k = 1,
    values = data.map(value),
    average = avg(values),
    dev = standardDeviation(values, average)
) {
    return {
        average,
        standardDeviation: dev,
        values,
        outliers: values
            .flatMap((value, i) =>
                Math.abs(value - average) > k * dev ? [i] : []
            )
            .flatMap((d) => data[d]!),
    };
}

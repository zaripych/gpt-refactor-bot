import { avg } from './avg';

export function standardDeviation(values: number[], average = avg(values)) {
    return Math.sqrt(
        avg(
            values.map((value) => {
                const diff = value - average;
                return diff * diff;
            })
        )
    );
}

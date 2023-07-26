export function hasOneElement<T>(arr: T[]): arr is [T, ...T[]] {
    return arr.length >= 1;
}

export function hasTwoElements<T>(arr: T[]): arr is [T, T, ...T[]] {
    return arr.length >= 2;
}

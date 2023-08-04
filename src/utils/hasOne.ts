import assert from 'assert';

export function hasOneElement<T>(arr: T[]): arr is [T, ...T[]] {
    return arr.length >= 1;
}

export function hasTwoElements<T>(arr: T[]): arr is [T, T, ...T[]] {
    return arr.length >= 2;
}

export function ensureHasOneElement<T>(arr: T[]) {
    assert(hasOneElement(arr));
    return arr;
}

export function ensureHasTwoElements<T>(arr: T[]) {
    assert(hasTwoElements(arr));
    return arr;
}

import assert from 'assert';

export function hasOneElement<T>(
    arr: readonly T[]
): arr is readonly [T, ...T[]];
export function hasOneElement<T>(arr: T[]): arr is [T, ...T[]];
export function hasOneElement(arr: unknown[] | readonly unknown[]): boolean {
    return arr.length >= 1;
}

export function ensureHasOneElement<Arr extends unknown[]>(
    arr: Arr
): [Arr[0], ...Arr[number][]];
export function ensureHasOneElement<Arr extends readonly unknown[]>(
    arr: Arr
): readonly [Arr[0], ...Arr[number][]];
export function ensureHasOneElement<Arr extends unknown[]>(arr: Arr) {
    assert(hasOneElement<Arr[number]>(arr));
    return arr;
}

export function hasTwoElements<T>(
    arr: readonly T[]
): arr is readonly [T, T, ...T[]];
export function hasTwoElements<T>(arr: T[]): arr is [T, T, ...T[]];
export function hasTwoElements(arr: unknown[] | readonly unknown[]): boolean {
    return arr.length >= 1;
}

export function ensureHasTwoElements<
    Arr extends unknown[] | readonly unknown[]
>(arr: Arr): [Arr[0], Arr[1], ...Arr[number][]];
export function ensureHasTwoElements<Arr extends readonly unknown[]>(
    arr: Arr
): readonly [Arr[0], Arr[1], ...Arr[number][]];
export function ensureHasTwoElements<
    Arr extends unknown[] | readonly unknown[]
>(arr: Arr) {
    assert(hasOneElement<Arr[number]>(arr));
    return arr;
}

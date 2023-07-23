import assert from 'assert';

export const isTruthy = <T>(
    value: T | false | '' | 0 | null | undefined
): value is Exclude<NonNullable<T>, false | '' | 0 | null | undefined> =>
    Boolean(value);

export const ensureTruthy = <T>(
    value: T | false | '' | 0 | null | undefined
): Exclude<NonNullable<T>, false | '' | 0 | null | undefined> => {
    assert(isTruthy(value));
    return value;
};

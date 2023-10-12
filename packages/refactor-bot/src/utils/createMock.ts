import { jest } from '@jest/globals';

type LooselyTypedMockInput<T extends object> = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [K in keyof T]: T[K] extends (...args: any[]) => any
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          jest.Mock<(...args: never[]) => any>
        : T[K];
};

export function looselyTypedMock<T extends object>(
    value: LooselyTypedMockInput<T>
): jest.Mocked<T> {
    return jest.mocked(value) as jest.Mocked<T>;
}

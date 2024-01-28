import { expect, it } from '@jest/globals';

import { shouldDisableCache } from './shouldDisableCache';

it(`should enable cache without flags`, () => {
    expect(
        shouldDisableCache({
            name: 'test',
            key: 'hierarchy/parent/test-123',
        })
    ).toBe(false);
});

it(`should enable cache when name matches`, () => {
    expect(
        shouldDisableCache({
            name: 'test',
            key: 'hierarchy/parent/test-123',
            enableCacheFor: ['test'],
        })
    ).toBe(false);
});

it(`should enable cache when key matches`, () => {
    expect(
        shouldDisableCache({
            name: 'test',
            key: 'hierarchy/parent/test-123',
            enableCacheFor: ['test-123'],
        })
    ).toBe(false);
});

it(`should enable cache when key matches pattern`, () => {
    expect(
        shouldDisableCache({
            name: 'test',
            key: 'hierarchy/parent/test-123',
            enableCacheFor: ['parent/test-123'],
        })
    ).toBe(false);
});

it(`should disable cache when key matches pattern for sub-step`, () => {
    expect(
        shouldDisableCache({
            name: 'child',
            key: 'hierarchy/parent/test-123/child',
            enableCacheFor: ['test-123'],
        })
    ).toBe(true);
});

it(`should disable cache when name doesn't matche`, () => {
    expect(
        shouldDisableCache({
            name: 'test',
            key: 'hierarchy/parent/test-123',
            enableCacheFor: ['another'],
        })
    ).toBe(true);
});

it(`should disable cache when key doesn't match`, () => {
    expect(
        shouldDisableCache({
            name: 'test',
            key: 'hierarchy/parent/test-123',
            enableCacheFor: ['another-123'],
        })
    ).toBe(true);
});

it(`should disable cache when key doesn't match`, () => {
    expect(
        shouldDisableCache({
            name: 'test',
            key: 'hierarchy/parent/test-123',
            enableCacheFor: ['test-123/child'],
        })
    ).toBe(true);
});

it(`should disable cache when name matches`, () => {
    expect(
        shouldDisableCache({
            name: 'test',
            key: 'hierarchy/parent/test-123',
            disableCacheFor: ['test'],
        })
    ).toBe(true);
});

it(`should disable cache when key matches`, () => {
    expect(
        shouldDisableCache({
            name: 'test',
            key: 'hierarchy/parent/test-123',
            disableCacheFor: ['test-123'],
        })
    ).toBe(true);
});

it(`should disable cache when key matches pattern`, () => {
    expect(
        shouldDisableCache({
            name: 'test',
            key: 'hierarchy/parent/test-123',
            disableCacheFor: ['parent/test-123'],
        })
    ).toBe(true);
});

it(`should NOT disable cache when key matches pattern for sub-step`, () => {
    expect(
        shouldDisableCache({
            name: 'child',
            key: 'hierarchy/parent/test-123/child',
            disableCacheFor: ['test-123'],
        })
    ).toBe(false);
});

it(`should enable cache when name doesn't matche`, () => {
    expect(
        shouldDisableCache({
            name: 'test',
            key: 'hierarchy/parent/test-123',
            disableCacheFor: ['another'],
        })
    ).toBe(false);
});

it(`should enable cache when key doesn't match`, () => {
    expect(
        shouldDisableCache({
            name: 'test',
            key: 'hierarchy/parent/test-123',
            disableCacheFor: ['another-123'],
        })
    ).toBe(false);
});

it(`should enable cache when key doesn't match`, () => {
    expect(
        shouldDisableCache({
            name: 'test',
            key: 'hierarchy/parent/test-123',
            disableCacheFor: ['test-123/child'],
        })
    ).toBe(false);
});

it(`should disable cache when */** is used`, () => {
    expect(
        shouldDisableCache({
            name: 'test',
            key: 'hierarchy/parent/test-123',
            disableCacheFor: ['parent/**'],
        })
    ).toBe(true);
});

it(`should enable cache when */** is used`, () => {
    expect(
        shouldDisableCache({
            name: 'test',
            key: 'hierarchy/parent/test-123',
            enableCacheFor: ['parent/**'],
        })
    ).toBe(false);
});

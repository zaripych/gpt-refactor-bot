import mm from 'micromatch';
import { basename } from 'path';

function shouldDisableCacheWithEnableFlag(opts: {
    name: string;
    key: string;
    enableCacheFor?: string[];
}) {
    if (!opts.enableCacheFor) {
        return false;
    }

    const nameIsNotInEnableCacheFor = !opts.enableCacheFor.includes(opts.name);
    const stepIsNotInEnableCacheFor = !opts.enableCacheFor.includes(
        basename(opts.key)
    );
    const patterns = opts.enableCacheFor.flatMap((pattern) => [
        '**/*' + pattern,
    ]);
    const stepDoesntMatchAnyPattern = !mm.isMatch(opts.key, patterns, {
        dot: true,
    });

    return (
        nameIsNotInEnableCacheFor &&
        stepIsNotInEnableCacheFor &&
        stepDoesntMatchAnyPattern
    );
}

function shouldDisableCacheWithDisableFlag(opts: {
    name: string;
    key: string;
    disableCacheFor?: string[];
}) {
    if (!opts.disableCacheFor) {
        return false;
    }

    const nameIsInDisableCacheFor = opts.disableCacheFor.includes(opts.name);
    const stepIsInDisableCacheFor = opts.disableCacheFor.includes(
        basename(opts.key)
    );
    const patterns = opts.disableCacheFor.flatMap((pattern) => [
        '**/*' + pattern,
    ]);
    const stepMatchesAnyPattern = mm.isMatch(opts.key, patterns, {
        dot: true,
    });

    return (
        nameIsInDisableCacheFor ||
        stepIsInDisableCacheFor ||
        stepMatchesAnyPattern
    );
}

export function shouldDisableCache(opts: {
    name: string;
    key: string;
    enableCacheFor?: string[];
    disableCacheFor?: string[];
}) {
    return (
        shouldDisableCacheWithEnableFlag(opts) ||
        shouldDisableCacheWithDisableFlag(opts)
    );
}

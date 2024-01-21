import { benchmark } from './benchmark';

export async function cliHandler(opts: {
    config: string;
    id?: string;
    // for debugging:
    saveToCache?: boolean;
    enableCacheFor?: string[];
    disableCacheFor?: string[];
}) {
    await benchmark(opts);
}

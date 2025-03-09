import { once } from 'node:events';

import { watch } from 'chokidar';

export const createWatcher = () => {
    const watcher = watch([], {
        atomic: true,
        disableGlobbing: true,
        ignoreInitial: true,
    });

    const activeWatchers = new Set<string>();

    const watchForChangesOnce = async (
        file: string,
        opts?: { signal?: AbortSignal }
    ) => {
        if (!activeWatchers.has(file)) {
            activeWatchers.add(file);
            watcher.add(file);
        }

        try {
            await Promise.race([
                once(watcher, 'change', opts),
                once(watcher, 'error', opts),
            ]);
        } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') {
                return;
            }
            throw err;
        } finally {
            activeWatchers.delete(file);
            if (!activeWatchers.has(file)) {
                watcher.unwatch(file);
            }
        }
    };

    return {
        watchForChangesOnce,
    };
};

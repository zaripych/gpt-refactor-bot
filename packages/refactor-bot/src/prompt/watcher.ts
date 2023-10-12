import { watch } from 'chokidar';

export const createWatcher = () => {
    const watcher = watch([], {
        atomic: true,
        disableGlobbing: true,
        ignoreInitial: true,
    });

    const watchForChangesOnce = async (file: string) => {
        watcher.add(file);
        await new Promise<void>((res, rej) => {
            const change = () => {
                cleanup();
                res();
            };
            const error = (err: unknown) => {
                cleanup();
                rej(err);
            };
            const cleanup = () => {
                watcher.removeListener('change', change);
                watcher.removeListener('error', error);
            };
            watcher.addListener('change', change);
            watcher.addListener('error', error);
        });
        watcher.unwatch(file);
    };

    return {
        watchForChangesOnce,
    };
};

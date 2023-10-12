export function onceAsync<T>(fn: () => T | Promise<T>): () => Promise<T> {
    let value: T;
    let inFlight: Promise<T> | null;
    let calculated = false;
    return async (): Promise<T> => {
        if (calculated) {
            return value;
        }
        if (inFlight) {
            return inFlight;
        }
        inFlight = Promise.resolve(fn());
        value = await inFlight;
        calculated = true;
        inFlight = null;
        return value;
    };
}

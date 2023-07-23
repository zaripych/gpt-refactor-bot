export function once<T>(fn: () => T): () => T {
    let value: T;
    let calculated = false;
    return (): T => {
        if (calculated) {
            return value;
        }
        value = fn();
        calculated = true;
        return value;
    };
}

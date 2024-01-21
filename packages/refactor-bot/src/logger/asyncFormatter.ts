import { Transform } from 'node:stream';

import type { TransformCallback } from 'stream';

import { onceAsync } from '../utils/onceAsync';

export type FormatterMethod = (value: unknown) => unknown;

export type Formatters = {
    [key: string]: FormatterMethod;
};

const format = async (
    value: object,
    formatters: Formatters
): Promise<unknown> => {
    const entries: Array<[string, unknown]> = Object.entries(value);
    const formatted = await Promise.all(
        entries.map(async ([key, value]) => {
            const formatter = formatters[key];
            if (formatter) {
                const formatted = await formatter(value);
                return [key, formatted] as const;
            } else {
                return [key, value] as const;
            }
        })
    );
    return { ...value, ...Object.fromEntries(formatted) };
};

export class AsyncFormatter extends Transform {
    private promise: Promise<unknown> | null = null;
    private formatters: () => Promise<Formatters>;

    constructor(opts: {
        formatters: Formatters | (() => Promise<{ formatters: Formatters }>);
    }) {
        super({
            objectMode: true,
            autoDestroy: true,
        });
        this.formatters = onceAsync(() =>
            typeof opts.formatters === 'function'
                ? opts.formatters().then((x) => x.formatters)
                : opts.formatters
        );
    }

    override _transform(
        chunk: object,
        _encoding: BufferEncoding,
        callback: TransformCallback
    ): void {
        if (typeof chunk === 'string') {
            throw new Error(`Expected object as input`);
        }

        const promise = (this.promise ?? Promise.resolve())
            .then(async () => format(chunk, await this.formatters()))
            .then((result) => {
                this.push(result);
                callback();
            })
            .catch((error: Error) => {
                callback(error);
            })
            .finally(() => {
                if (this.promise === promise) {
                    this.promise = null;
                }
            });

        this.promise = promise;
    }

    override _destroy(
        _error: Error | null,
        callback: (error: Error | null) => void
    ): void {
        if (this.promise) {
            void this.promise.finally(() => {
                callback(null);
            });
        } else {
            callback(null);
        }
    }

    override _flush(callback: TransformCallback): void {
        if (this.promise) {
            void this.promise.finally(() => {
                callback();
            });
        } else {
            callback(null);
        }
    }
}

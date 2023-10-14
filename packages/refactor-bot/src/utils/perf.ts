import { EOL } from 'node:os';
import { PerformanceObserver } from 'node:perf_hooks';
import { format } from 'node:util';

import { sha1 } from 'object-hash';

export function logPerformanceEntries(): void {
    const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
            process.stdout.write(format(entry) + EOL);
        }
    });
    observer.observe({
        entryTypes: ['function', 'measure'],
    });
}

export async function measure<Fn extends (...args: never[]) => unknown>(
    fn: Fn,
    ...args: Parameters<Fn>
): Promise<ReturnType<Fn>> {
    const name = fn.name || sha1(new Error().stack || '').substring(0, 8);

    performance.mark(`${name}-start`);
    const result = await fn(...args);
    performance.mark(`${name}-end`);

    performance.measure(name, `${name}-start`, `${name}-end`);

    return result as ReturnType<Fn>;
}

import { relative } from 'path';

import type { FunctionsConfig } from './types';

function sanitizeText(text: string, config: FunctionsConfig) {
    if (text.startsWith(config.repositoryRoot)) {
        return relative(config.repositoryRoot, text);
    }
    return text;
}

export function sanitizeFunctionResult(opts: {
    result: unknown;
    config: FunctionsConfig;
}): unknown {
    const { result, config } = opts;

    if (typeof result === 'string') {
        return sanitizeText(result, config);
    }

    if (typeof result === 'object' && result !== null) {
        if (Array.isArray(result)) {
            const array = result as unknown[];
            return array.map((item) =>
                sanitizeFunctionResult({ result: item, config })
            );
        }

        const sanitized: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(result)) {
            sanitized[key] = sanitizeFunctionResult({
                result: value,
                config,
            });
        }

        return sanitized;
    }

    return result;
}

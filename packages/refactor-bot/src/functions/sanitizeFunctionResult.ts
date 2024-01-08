import { realpath } from 'fs/promises';
import { relative } from 'path';

import { escapeRegExp } from '../utils/escapeRegExp';
import type { FunctionsConfig } from './types';

type SanitizationParameters = {
    repositoryRoot: string;
    realRepositoryRoot: string;
};

async function evaluateParameters(config: FunctionsConfig) {
    const realRepositoryRoot = await realpath(config.repositoryRoot).catch(
        () => {
            return config.repositoryRoot;
        }
    );
    return {
        repositoryRoot: config.repositoryRoot,
        realRepositoryRoot,
    };
}

function sanitizeText(text: string, config: SanitizationParameters) {
    if (
        text.includes(config.repositoryRoot) ||
        text.includes(config.realRepositoryRoot)
    ) {
        return text
            .replaceAll(
                new RegExp(`(${escapeRegExp(config.repositoryRoot)})`, 'g'),
                (match) => '.' + relative(config.repositoryRoot, match)
            )
            .replaceAll(
                new RegExp(`(${escapeRegExp(config.realRepositoryRoot)})`, 'g'),
                (match) => '.' + relative(config.repositoryRoot, match)
            );
    }
    return text;
}

function sanitizeFunctionResultWithParams(opts: {
    result: unknown;
    params: SanitizationParameters;
}): unknown {
    const { result, params } = opts;

    if (typeof result === 'string') {
        return sanitizeText(result, params);
    }

    if (typeof result === 'object' && result !== null) {
        if (Array.isArray(result)) {
            const array = result as unknown[];
            return array.map((item) =>
                sanitizeFunctionResultWithParams({ result: item, params })
            );
        }

        const sanitized: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(result)) {
            sanitized[key] = sanitizeFunctionResultWithParams({
                result: value,
                params,
            });
        }

        return sanitized;
    }

    return result;
}

export async function sanitizeFunctionResult<T>(opts: {
    result: T;
    config: FunctionsConfig;
}): Promise<T> {
    const { result, config } = opts;

    const params = await evaluateParameters(config);

    return sanitizeFunctionResultWithParams({
        result,
        params,
    }) as T;
}

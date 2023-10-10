import type { ForegroundColorName } from 'chalk';
import chalk from 'chalk';
import { once as onEvent } from 'events';
import type { Writable } from 'stream';
import { pipeline, Transform } from 'stream';

import { once } from '../utils/once';
import { AsyncFormatter } from './asyncFormatter';
import { extractLogEntry } from './extractLogEntry';
import { formatObject } from './formatObject';

/**
 * @note this list is ordered
 */
const levels = [
    'fatal',
    'error',
    'warn',
    'info',
    'log',
    'debug',
    'trace',
    'silly',
] as const;

const colors: { [level in LogLevel]: ForegroundColorName } = {
    fatal: 'redBright',
    error: 'red',
    warn: 'yellow',
    info: 'blue',
    log: 'blue',
    debug: 'green',
    trace: 'white',
    silly: 'grey',
};

type LogLevel = (typeof levels)[number];

type LogMethod = {
    (message: string, ...args: unknown[]): void;
    (obj: unknown, ...args: unknown[]): void;
};

export type Logger = {
    [key in LogLevel]: LogMethod;
};

const isLevel = (level?: string): level is LogLevel =>
    levels.includes(level as LogLevel);

const logLevelFromProcessArgs = (
    args = process.argv
): LogLevel | 'off' | undefined => {
    const index = args.findIndex((value) => value === '--log-level');
    if (index === -1) {
        return undefined;
    }
    const level = args[index + 1];
    if (level === 'silent' || level === 'off') {
        return 'off';
    }
    if (!isLevel(level)) {
        return undefined;
    }
    return level;
};

const logLevelFromEnv = (): LogLevel | 'off' | undefined => {
    const level = process.env['LOG_LEVEL'];
    if (level === 'silent' || level === 'off') {
        return 'off';
    }
    if (!isLevel(level)) {
        return undefined;
    }
    return level;
};

const levelSymbol = Symbol('level');
const messageSymbol = Symbol('message');

const getLogLevel = once(() => {
    const argsLevel = logLevelFromProcessArgs();
    const envLevel = logLevelFromEnv();
    return argsLevel ?? envLevel ?? 'info';
});

const destination = once(() => {
    const formatter = new AsyncFormatter({
        formatters: () => import('./formatters'),
    });
    const stringifier = new Transform({
        objectMode: true,
        autoDestroy: true,
        transform: (
            chunk: {
                [levelSymbol]: string;
                [messageSymbol]: string;
            },
            _encoding,
            callback
        ) => {
            const {
                [levelSymbol]: level = 'info',
                [messageSymbol]: message = '',
                ...rest
            } = chunk;

            const prettyMessage =
                Object.keys(rest).length > 0
                    ? '\n' + formatObject(rest)
                    : undefined;

            const colorName = colors[level as LogLevel];

            const result = [
                chalk[colorName](level),
                ': ',
                message,
                prettyMessage,
                '\n',
                '\n',
            ]
                .filter(Boolean)
                .join('');

            callback(undefined, result);
        },
    });
    // prevent process.stdout from participating in the "close"
    // event handling of the pipeline
    const consoleOutput = new Transform({
        autoDestroy: true,
        transform: (chunk: string, _encoding, callback) => {
            process.stdout.write(chunk, callback);
        },
    });
    pipeline(formatter, stringifier, consoleOutput, (err) => {
        if (err) {
            console.error('Logging disabled due to', err);
        }
    });
    return formatter;
});

const convertParams = (params: unknown[]): [string, ...unknown[]] => {
    const [first, ...rest] = params;
    if (typeof first === 'string') {
        return [first, ...rest];
    }
    return ['', ...params];
};

const noop = () => {
    //
};

const createLogger = (opts: {
    level: LogLevel | 'off';
    destination: Writable;
}) => {
    const enabledIndex = opts.level === 'off' ? -1 : levels.indexOf(opts.level);
    const enabledLevels = new Set(
        levels.filter((_, index) => index <= enabledIndex)
    );

    const log = (level: LogLevel, ...params: [string, ...unknown[]]) => {
        const entry = extractLogEntry(level, params);
        const logEntry = {
            ...entry.data,
            [levelSymbol]: entry.level,
            [messageSymbol]: entry.message,
        };
        opts.destination.write(logEntry);
    };

    const result = levels.reduce((acc, level) => {
        if (enabledLevels.has(level)) {
            return {
                ...acc,
                [level]: (...params: unknown[]) => {
                    log(level, ...convertParams(params));
                },
            };
        }
        return {
            ...acc,
            [level]: noop,
        };
    }, {} as Logger);

    return result;
};

export const logger: Logger = createLogger({
    level: getLogLevel(),
    destination: destination(),
});

export const flush = async () => {
    const stream = destination();
    stream.end();
    await onEvent(stream, 'finish');
};

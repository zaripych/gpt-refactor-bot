import { once } from '../utils/once';

const levels = ['debug', 'info', 'warn', 'error', 'fatal'] as const;

type LogLevel = (typeof levels)[number];

type Params = Parameters<typeof console.log>;

type Logger = {
    logLevel: LogLevel;
    debug(...params: Params): void;
    info(...params: Params): void;
    // alias for info
    log(...params: Params): void;
    // special treatment, disabled on CI/TTY
    tip(...params: Params): void;
    warn(...params: Params): void;
    error(...params: Params): void;
    fatal(...params: Params): void;
};

const enabledLevelsAfter = (level: LogLevel | 'off') => {
    if (level === 'off') {
        return [];
    }
    const index = levels.findIndex((item) => item === level);
    if (index === -1) {
        throw new Error('Invalid level');
    }
    return levels.slice(index);
};

const isLevel = (level?: string): level is LogLevel =>
    levels.includes(level as LogLevel);

const verbosityFromProcessArgs = (
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

const verbosityFromEnv = (): LogLevel | 'off' | undefined => {
    const level = process.env['LOG_LEVEL'];
    if (level === 'silent' || level === 'off') {
        return 'off';
    }
    if (!isLevel(level)) {
        return undefined;
    }
    return level;
};

const getVerbosityConfig = () => {
    const argsLevel = verbosityFromProcessArgs();
    const envLevel = verbosityFromEnv();
    return argsLevel ?? envLevel ?? 'info';
};

const noop = (..._args: Params) => {
    // noop
};

const log = (...args: Params) => {
    console.log(...args);
};

const error = (...args: Params) => {
    console.error(...args);
};

const shouldEnableTip = () => !process.env['CI'] && !process.stdout.isTTY;

export const createLogger = (
    deps = { getVerbosityConfig, log, error, shouldEnableTip }
) => {
    const logLevel = deps.getVerbosityConfig();
    const enabled = enabledLevelsAfter(logLevel);
    return levels.reduce(
        (acc, lvl) => ({
            ...acc,
            [lvl]: enabled.includes(lvl)
                ? ['fatal', 'error'].includes(lvl)
                    ? deps.error
                    : deps.log
                : noop,
        }),
        {
            logLevel,
            log: enabled.includes('info') ? deps.log : noop,
            tip:
                enabled.includes('info') && deps.shouldEnableTip()
                    ? deps.log
                    : noop,
        } as Logger
    );
};

const createDelegatingLogger = (opts: { parent: Logger }): Logger =>
    Object.freeze({
        get logLevel() {
            return opts.parent.logLevel;
        },
        debug(...params: Params): void {
            opts.parent.debug(...params);
        },
        info(...params: Params): void {
            opts.parent.info(...params);
        },
        log(...params: Params): void {
            opts.parent.log(...params);
        },
        tip(...params: Params): void {
            opts.parent.tip(...params);
        },
        warn(...params: Params): void {
            opts.parent.warn(...params);
        },
        error(...params: Params): void {
            opts.parent.error(...params);
        },
        fatal(...params: Params): void {
            opts.parent.fatal(...params);
        },
    });

let defaultLoggerFactory: (() => Logger) | null;

export const configureDefaultLogger = (factory: () => Logger) => {
    if (defaultLoggerFactory) {
        const err = {
            stack: '',
        };
        Error.captureStackTrace(err);
        logger.debug(
            'Cannot override default logger multiple times',
            err.stack
        );
        return;
    }
    defaultLoggerFactory = factory;
};

const defaultLogger = once(() => {
    let factory = defaultLoggerFactory;
    if (!factory) {
        factory = () => createLogger();
    }
    return factory();
});

/**
 * Default logger instance can be configured once at startup
 */
export const logger: Logger = createDelegatingLogger({
    get parent() {
        return defaultLogger();
    },
});

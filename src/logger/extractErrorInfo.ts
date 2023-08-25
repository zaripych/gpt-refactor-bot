export const extractErrorInfo = (
    err: Error,
    includeStack = true
): Record<string, unknown> => {
    const { cause } = err;

    const entries: [string, unknown][] = Object.entries(err).filter(
        ([key, value]) => typeof value !== 'function' || key === 'cause'
    );

    const deeper =
        cause && cause instanceof Error
            ? extractErrorInfo(cause, false)
            : undefined;

    return {
        ...Object.fromEntries(entries),
        ...(deeper && {
            cause: deeper,
        }),
        ...(includeStack && {
            stack: err.stack,
        }),
    };
};

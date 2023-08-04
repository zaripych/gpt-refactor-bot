export const handleExceptions = <
    Fn extends () => unknown,
    Handler extends (err: unknown) => unknown
>(
    fn: Fn,
    handler: Handler
): ReturnType<Fn> | ReturnType<Handler> => {
    try {
        return fn() as ReturnType<Fn>;
    } catch (err) {
        return handler(err) as ReturnType<Handler>;
    }
};

export const handleExceptionsAsync = async <
    Fn extends () => unknown | Promise<unknown>,
    Handler extends (err: unknown) => unknown | Promise<unknown>
>(
    fn: Fn,
    handler: Handler
): Promise<Awaited<ReturnType<Fn>> | Awaited<ReturnType<Handler>>> => {
    try {
        return await Promise.resolve(fn() as Awaited<ReturnType<Fn>>);
    } catch (err) {
        return await Promise.resolve(
            handler(err) as Awaited<ReturnType<Handler>>
        );
    }
};

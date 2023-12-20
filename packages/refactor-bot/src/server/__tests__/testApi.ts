export const testApi = {
    ping: () => {
        return 'pong';
    },
    echo: (data: string) => {
        return data;
    },
    throwRegularError: () => {
        throw new Error('Regular error');
    },
    throwNonError: () => {
        throw 'Non-error';
    },
};

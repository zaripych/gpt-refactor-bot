export function isFileNotFoundError(err: unknown) {
    return Boolean(
        typeof err === 'object' && err && 'code' in err && err.code === 'ENOENT'
    );
}

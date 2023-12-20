/**
 * A type of error that occurs when executing a remote function
 * and receiving an error status, in that case the error received
 * is not an instance of an error anymore but a serialized representation
 * which we then convert to this `RpcError` instance
 */
export class RpcError extends Error {
    public readonly remoteErrorName: string | undefined;

    constructor(
        message?: string,
        options?: ErrorOptions & {
            remoteErrorName?: string;
        }
    ) {
        super(message, options);
        this.name = 'RpcError';
        this.remoteErrorName = options?.remoteErrorName;
        this.cause = options?.cause;
    }
}

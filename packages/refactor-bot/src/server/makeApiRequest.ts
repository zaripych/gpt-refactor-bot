import type { IncomingMessage } from 'node:http';
import { request } from 'node:http';

import { z } from 'zod';

import { RpcError } from './rpcError';

export function convertErrorInfoToRpcError(errorInfo: {
    name: string;
    message: string;
    stack?: string;
}) {
    const { name, message, stack } = errorInfo;
    const cause = new Error(message);
    cause.name = name;
    cause.stack = stack;
    return new RpcError(message, { cause, remoteErrorName: name });
}

export async function makeApiRequest(opts: {
    unixSocketPath: string;
    method: string;
    data?: unknown;
    apiPasskey?: string;
}) {
    const handleResponse = async (res: IncomingMessage) => {
        if (typeof res.statusCode !== 'number') {
            throw new Error('Unexpected response');
        }

        if (![200, 400, 500].includes(res.statusCode)) {
            throw new Error(`Unexpected status code: ${res.statusCode}`);
        }

        if (
            res.headers['content-type'] &&
            !res.headers['content-type'].startsWith('application/json')
        ) {
            throw new Error(
                `Unexpected content type: ${res.headers['content-type']}`
            );
        }

        const buffers: Buffer[] = [];

        for await (const chunk of res) {
            if (!(chunk instanceof Buffer)) {
                throw new Error('Unexpected response');
            }

            buffers.push(chunk);
        }

        const body = Buffer.concat(buffers).toString('utf-8');

        const result = z
            .union([
                z.object({
                    error: z
                        .object({
                            name: z.string(),
                            message: z.string(),
                            stack: z.string().optional(),
                        })
                        .passthrough(),
                }),
                z.object({
                    response: z.unknown({}).optional(),
                }),
            ])
            .parse(JSON.parse(body));

        if ('error' in result) {
            throw convertErrorInfoToRpcError(result.error);
        }

        return result.response;
    };

    return new Promise<unknown>((res, rej) => {
        const req = request(
            {
                socketPath: opts.unixSocketPath,
                path: `/api/${opts.method}`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(opts.apiPasskey && {
                        authorization: `Bearer ${opts.apiPasskey}`,
                    }),
                },
            },
            (response) => {
                try {
                    res(handleResponse(response));
                } catch (err) {
                    rej(err);
                }
            }
        );
        req.addListener('error', (err) => {
            rej(err);
        });
        req.setNoDelay(true);
        req.end(
            JSON.stringify({
                ...(Boolean(opts.data) && {
                    data: opts.data,
                }),
            })
        );
        req.on('close', () => {
            req.removeAllListeners();
        });
    });
}

import { type IncomingMessage, request } from 'http';

export async function makeHttpRequest(opts: {
    unixSocketPath: string;
    path: string;
    method: string;
    body?: unknown;
    headers?: Record<string, string>;
}) {
    const handleResponse = async (res: IncomingMessage) => {
        if (typeof res.statusCode !== 'number') {
            throw new Error('Unexpected response');
        }

        const buffers: Buffer[] = [];

        for await (const chunk of res) {
            if (!(chunk instanceof Buffer)) {
                throw new Error('Unexpected response');
            }

            buffers.push(chunk);
        }

        const text = Buffer.concat(buffers).toString('utf-8');

        return {
            text,
            headers: res.headers,
            statusCode: res.statusCode,
        };
    };

    return new Promise<unknown>((res, rej) => {
        const req = request(
            {
                socketPath: opts.unixSocketPath,
                path: opts.path,
                method: opts.method,
                headers: opts.headers,
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
        req.end(opts.body);
        req.on('close', () => {
            req.removeAllListeners();
        });
    });
}

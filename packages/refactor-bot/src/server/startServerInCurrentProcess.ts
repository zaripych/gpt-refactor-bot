import { timingSafeEqual } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname } from 'node:path';

import express from 'express';

import { errorResponse, handleApiRequest } from './handleApiRequest';
import { loadApi } from './loadApi';

const timingSafeEqualPasskeys = (a: string, b: string) => {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
};

/**
 * This starts the unix socket server in the current process
 */
export async function startServerInCurrentProcess(opts: {
    unixSocketPath: string;
    apiModulePath: string;
    apiExportName: string;
    apiPasskey: string;
}) {
    const { unixSocketPath, apiModulePath, apiExportName } = opts;

    await mkdir(dirname(unixSocketPath), { recursive: true });

    const api = await loadApi({
        apiModulePath,
        apiExportName,
    });

    const server = express();
    const json = express.json();
    server.use((req, res, next) => {
        json(req, res, (err) => {
            if (err) {
                res.status(400).send(
                    errorResponse(
                        new Error('Invalid JSON', {
                            cause: err,
                        }),
                        {
                            includeStack: false,
                        }
                    )
                );
                return;
            }
            next();
        });
    });
    server.use((req, res, next) => {
        const header = req.headers['authorization'];
        if (!header) {
            res.status(401).send(
                errorResponse(
                    new Error('Unauthorized', {
                        cause: new Error('Authentication header missing'),
                    })
                )
            );
            return;
        }
        if (!timingSafeEqualPasskeys(header, `Bearer ${opts.apiPasskey}`)) {
            res.status(401).send(
                errorResponse(
                    new Error('Unauthorized', {
                        cause: new Error('Invalid API Passkey'),
                    })
                )
            );
            return;
        }
        next();
    });
    server.post('/api/:method', (req, res) => {
        handleApiRequest(api, req, res).catch((err) => {
            console.error(err);
            res.status(500).send(
                errorResponse(
                    new Error('Internal Server Error', { cause: err })
                )
            );
        });
    });
    server.use((_, res) => {
        res.status(404).send(
            errorResponse(new Error('Not found'), {
                includeStack: false,
            })
        );
    });

    const listeningServer = await new Promise<
        ReturnType<(typeof server)['listen']>
    >((res, rej) => {
        const httpServer = createServer(server);
        const result = httpServer.listen(unixSocketPath, () => {
            res(result);
        });
        const errorListener = (err: Error) => {
            httpServer.removeListener('error', errorListener);
            rej(err);
        };
        httpServer.addListener('error', errorListener);
    });

    const teardown = () => {
        if (listeningServer.listening) {
            listeningServer.close();
        }
        server.removeAllListeners();
    };

    return {
        checkStatus: () => {
            if (!listeningServer.listening) {
                throw new Error('Server is not listening, did you teardown?');
            }
        },
        teardown,
    };
}

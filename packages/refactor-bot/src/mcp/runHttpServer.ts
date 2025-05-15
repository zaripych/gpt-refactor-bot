import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { once } from 'events';
import express from 'express';

import { logger } from '../logger/logger';
import { ensureTruthy } from '../utils/isTruthy';
import { randomText } from '../utils/randomText';

export async function runHttpServer(opts: {
    port: number;
    host: string;
    server: Server;
    signal?: AbortSignal;
}) {
    const { port, host, server, signal } = opts;

    const app = express();
    app.use(express.json());

    const transports = {
        streamable: {} as Record<string, StreamableHTTPServerTransport>,
        sse: {} as Record<string, SSEServerTransport>,
    };

    app.all('/mcp', async (req, res) => {
        const sessionId = req.headers['mcp-session-id'];
        if (Array.isArray(sessionId)) {
            res.status(400).json({
                jsonrpc: '2.0',
                error: {
                    code: -32000,
                    message: 'Bad Request: No valid session ID provided',
                },
                id: null,
            });
            return;
        }

        let transport: StreamableHTTPServerTransport;
        if (sessionId && transports.streamable[sessionId]) {
            transport = ensureTruthy(transports.streamable[sessionId]);
        } else if (!sessionId && isInitializeRequest(req.body)) {
            transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: () => randomText(8),
                onsessioninitialized: (sessionId) => {
                    transports.streamable[sessionId] = transport;
                },
            });

            transport.onclose = () => {
                if (transport.sessionId) {
                    delete transports.streamable[transport.sessionId];
                }
            };

            await server.connect(transport);
        } else {
            res.status(400).json({
                jsonrpc: '2.0',
                error: {
                    code: -32000,
                    message: 'Bad Request: No valid session ID provided',
                },
                id: null,
            });
            return;
        }

        await transport.handleRequest(req, res, req.body);
    });

    const handleSessionRequest = async (
        req: express.Request,
        res: express.Response
    ) => {
        const sessionId = req.headers['mcp-session-id'];
        if (Array.isArray(sessionId)) {
            res.status(400).json({
                jsonrpc: '2.0',
                error: {
                    code: -32000,
                    message: 'Bad Request: No valid session ID provided',
                },
                id: null,
            });
            return;
        }
        if (!sessionId || !transports.streamable[sessionId]) {
            res.status(400).send('Invalid or missing session ID');
            return;
        }

        const transport = ensureTruthy(transports.streamable[sessionId]);
        await transport.handleRequest(req, res);
    };

    app.get('/mcp', handleSessionRequest);

    app.delete('/mcp', handleSessionRequest);

    app.get('/sse', async (req, res) => {
        logger.silly('GET /sse', {
            headers: req.headers,
            body: req.body as unknown,
            query: req.query,
        });

        const transport = new SSEServerTransport('/messages', res);
        transports.sse[transport.sessionId] = transport;

        res.on('close', () => {
            delete transports.sse[transport.sessionId];
        });

        await server.connect(transport);
    });

    app.post('/messages', async (req, res) => {
        logger.silly('POST /messages', {
            headers: req.headers,
            body: req.body as unknown,
            query: req.query,
        });

        const sessionId = req.query['sessionId']?.toString();
        if (!sessionId) {
            res.status(400).send('sessionId is required');
            return;
        }
        const transport = transports.sse[sessionId];
        if (transport) {
            await transport.handlePostMessage(req, res);
        } else {
            res.status(400).send('No transport found for sessionId');
        }
    });

    const httpServer = app.listen(port, host);
    try {
        await once(httpServer, 'close', { signal });
    } catch (error) {
        httpServer.close();
    }
}

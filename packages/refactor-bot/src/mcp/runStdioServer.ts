import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

export async function runStdioServer(opts: {
    server: Server;
    signal?: AbortSignal;
}) {
    const { server } = opts;
    const transport = new StdioServerTransport();
    await server.connect(transport);
    await new Promise<void>((resolve, reject) => {
        server.onclose = () => {
            resolve();
        };
        server.onerror = (error) => {
            reject(error);
        };
    });
}

import { buildServer } from './buildServer';

type RunMcpServerOptions = {
    location?: string;
    port?: number;
    host?: string;
    protocol?: 'stdio' | 'http';
};

export async function run(opts: RunMcpServerOptions) {
    const { port, host, protocol } = opts;

    const { runServer } = await buildServer({
        location: opts.location,
        port,
        host,
        protocol,
    });

    await runServer();
}

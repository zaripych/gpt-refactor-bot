import { pathToFileURL } from 'node:url';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    RootsListChangedNotificationSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { findRepositoryRoot } from '../file-system/findRepositoryRoot';
import { logger } from '../logger/logger';
import { markdown } from '../markdown/markdown';
import { line } from '../text/line';
import { ensureHasOneElement } from '../utils/hasOne';
import { mutateObjectSchema } from '../zod/mutateObjectSchema';
import { createWorkspace, nameFromLocation } from './createWorkspace';
import { runHttpServer } from './runHttpServer';
import { runStdioServer } from './runStdioServer';

export const mcpServerOptions = z.object({
    location: z.string().optional(),
    port: z.number().default(3000),
    host: z.string().default('localhost'),
    protocol: z.enum(['stdio', 'http']).default('stdio'),
});

export type MCPServerOptions = z.input<typeof mcpServerOptions>;

async function initializeWorkspacesFromMcpRoots(
    roots: Array<{ uri: string; name?: string }>,
    state: {
        workspaces: Array<Awaited<ReturnType<typeof createWorkspace>>>;
        location: string | undefined;
    }
) {
    if (roots.length > 0) {
        logger.info(`Initializing workspaces from MCP client`, {
            roots,
        });
    }

    for (const root of roots) {
        const name =
            root.name || nameFromLocation({ location: root.uri, sep: '/' });
        const existing = state.workspaces.find(
            (project) => project.uri === root.uri
        );

        if (existing) {
            logger.debug(`Workspace "${name}" already initialized`);
            continue;
        }

        const workspace = await createWorkspace({
            uri: root.uri,
            name,
        });

        state.workspaces.push(workspace);
    }

    const rootsToTearDown = state.workspaces.filter(
        (workspace) =>
            !roots.some(
                (root) =>
                    root.uri === workspace.uri && root.uri !== state.location
            )
    );

    for (const workspace of rootsToTearDown) {
        logger.info(`Removing workspace "${workspace.name}"`);
        state.workspaces.splice(state.workspaces.indexOf(workspace), 1);
    }
}

async function createWorkspacesState(
    options: z.output<typeof mcpServerOptions>
) {
    const workspaces: Array<Awaited<ReturnType<typeof createWorkspace>>> = [];

    const location = options.location
        ? await findRepositoryRoot(options.location)
        : await findRepositoryRoot().catch(() => undefined);

    if (!options.location && location) {
        logger.info(`Found workspace at`, {
            location,
        });
    } else if (!location) {
        logger.warn(markdown`
            No location provided as parameter, will expect MCP roots to be
            provided by the client. MCP roots will be used to determine location
            of the workspace we are working with. Alternatively, you can provide
            a location of a workspace using the \`--location\` parameter.
        `);
    }

    if (location) {
        logger.info(`Initializing workspace at`, {
            location,
        });
        const workspace = await createWorkspace({
            uri: pathToFileURL(location).toString(),
        });
        workspaces.push(workspace);
    }

    return {
        workspaces,
        location,
        initializeWorkspacesFromMcpRoots: (roots: Array<{ uri: string }>) =>
            initializeWorkspacesFromMcpRoots(roots, { workspaces, location }),
    };
}

export async function buildServer(optionsRaw: MCPServerOptions) {
    const options = await mcpServerOptions.parseAsync(optionsRaw);

    const server = new Server(
        {
            name: 'refactor-bot',
            version: '0.0.1',
        },
        {
            capabilities: {
                tools: {},
            },
        }
    );

    const { initializeWorkspacesFromMcpRoots, workspaces } =
        await createWorkspacesState(options);

    server.oninitialized = () => {
        const capabilities = server.getClientCapabilities();
        if (capabilities?.roots) {
            (async () => {
                const { roots } = await server.listRoots();
                await initializeWorkspacesFromMcpRoots(roots);
            })().catch((error: unknown) => {
                if (
                    error instanceof Error &&
                    !error.message.includes('Method not found')
                ) {
                    logger.error('Failed to list and/or initialize roots', {
                        error,
                    });
                }
            });
        }
    };
    server.onerror = (error) => {
        logger.error('Error in MCP server', {
            error,
        });
    };

    server.setNotificationHandler(
        RootsListChangedNotificationSchema,
        async () => {
            const { roots } = await server.listRoots();
            await initializeWorkspacesFromMcpRoots(roots);
            await server.sendToolListChanged();
        }
    );

    server.setRequestHandler(ListToolsRequestSchema, () => {
        logger.trace('ListToolsRequest', {
            workspaces: workspaces.map((w) => ({
                name: w.name,
                path: w.sandbox.sandboxDirectoryPath,
            })),
        });

        let rootSchema: z.ZodType = z.NEVER;
        if (workspaces.length > 1) {
            const rootNames = ensureHasOneElement(
                workspaces.map((project) => project.name)
            );
            rootSchema = z.enum(rootNames);
        }

        const functions = new Map(
            workspaces
                .flatMap(({ dependencies }) =>
                    dependencies.functionsRepository().functions()
                )
                .map((fn) => [
                    fn.name,
                    {
                        name: fn.name,
                        inputSchema: zodToJsonSchema(
                            workspaces.length > 1
                                ? mutateObjectSchema(fn.argsSchema, (schema) =>
                                      schema.extend({
                                          root: rootSchema,
                                      })
                                  )
                                : fn.argsSchema
                        ),
                        description: fn.description,
                    },
                ])
        );

        logger.silly('ListToolsRequest', {
            functions,
        });

        const tools = Array.from(functions.values());

        return {
            tools,
        };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        if (workspaces.length === 0) {
            throw new Error(line`
                MCP server doesn't have any roots initialized, use a client that
                supports roots, or start the server with a --location parameter
            `);
        }

        const root =
            typeof request.params.arguments === 'object' &&
            'root' in request.params.arguments &&
            typeof request.params.arguments['root'] === 'string'
                ? request.params.arguments['root']
                : undefined;

        if (!root && workspaces.length > 1) {
            throw new Error(
                markdown`
                    MCP server has multiple workspaces initialized, please specify one
                    using the \`root\` argument in the function call.
                    Available workspaces: ${workspaces
                        .map((project) => project.name)
                        .join(', ')}
                `
            );
        }

        const rootProject =
            workspaces.find((project) => project.name === root) ??
            workspaces[0];

        if (!rootProject) {
            throw new Error(
                `Cannot find root directory to work with using name "${root}"`
            );
        }

        const { dependencies, ctx } = rootProject;

        const functions = dependencies.functionsRepository();

        try {
            const result = await functions.executeFunction(
                {
                    name: request.params.name,
                    arguments: request.params.arguments,
                },
                ctx
            );

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(result),
                    },
                ],
                isError: false,
            };
        } catch (err) {
            return {
                content: [
                    {
                        type: 'text',
                        text: await functions.sanitizeFunctionResult(err),
                    },
                ],
                isError: true,
            };
        }
    });

    async function runServer() {
        if (options.protocol === 'http') {
            logger.info(`Starting HTTP server`, {
                uri: `http://${options.host}:${options.port}/mcp`,
            });
            await runHttpServer({
                port: options.port,
                host: options.host,
                server,
            });
        } else {
            logger.info(`Starting stdio server`);
            await runStdioServer({
                server,
            });
        }
    }

    return {
        runServer,
    };
}

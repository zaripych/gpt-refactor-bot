import { readFile } from 'fs/promises';
import { load } from 'js-yaml';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

import { findRepositoryRoot } from '../file-system/findRepositoryRoot';
import { checkoutSandbox } from '../refactor/checkoutSandbox';
import { prepareRefactorDeps } from '../refactor/dependencies/prepareDependencies';
import { refactorConfigSchema } from '../refactor/types';
import { randomText } from '../utils/randomText';

/**
 * The config that users can edit that do not point
 * to a specific directory/repository or location.
 */
const editableConfigSchema = refactorConfigSchema
    .omit({
        name: true,
        location: true,
        repository: true,
    })
    .augment({
        allowDirtyWorkingTree: z.boolean().default(true),
        createSandbox: z.boolean().default(false),
        commitDirtyWorkingTree: z.boolean().default(false),
        installDependencies: z.boolean().default(true),
    });

export function nameFromLocation(opts: { location: string; sep: string }) {
    const pathnameParts = opts.location
        .split(opts.sep)
        .map((text) => text.trim().replaceAll(/[^a-zA-Z0-9-_]/g, ''))
        .filter(Boolean);

    const last = pathnameParts[pathnameParts.length - 1];

    if (!last) {
        return randomText(8);
    }

    return last;
}

function locationFromUrl(opts: { uri: string }) {
    const url = new URL(opts.uri);

    if (url.protocol === 'file:') {
        const location = fileURLToPath(url);
        return {
            location,
            name: nameFromLocation({ location: url.pathname, sep: '/' }),
        };
    }

    return {
        // assume git repository to checkout
        repository: opts.uri,
        createSandbox: true,
        name: nameFromLocation({ location: url.pathname, sep: '/' }),
    };
}

export async function loadConfig(opts: { configPath: string }) {
    return await editableConfigSchema.parseAsync(
        load(await readFile(opts.configPath, 'utf-8'))
    );
}

export async function createWorkspace(opts: {
    uri: string;
    name?: string;
    config?: z.input<typeof editableConfigSchema>;
    configPath?: string;
}) {
    const configPrototype = opts.config
        ? opts.config
        : opts.configPath
        ? await loadConfig({ configPath: opts.configPath })
        : undefined;

    const config = {
        ...(await editableConfigSchema.parseAsync(configPrototype || {})),
        ...locationFromUrl(opts),
        id: randomText(8),
    };

    /**
     * @note CACHE_ROOT is an environment variable that is used to override the
     * default cache root. This is used by the benchmarking tool to place cached
     * data at the root folder of the repository where the benchmark is run
     */
    const cacheRoot =
        process.env['CACHE_ROOT'] ??
        (await findRepositoryRoot(config.location));

    const cacheLocation = join(
        cacheRoot,
        `.refactor-bot/mcp/${config.name}/state/`,
        config.id
    );

    const ctx = {
        location: cacheLocation,
    };

    const sandbox = await checkoutSandbox(config, ctx);

    const dependencies = await prepareRefactorDeps({
        ...config,
        sandboxDirectoryPath: sandbox.sandboxDirectoryPath,
        startCommit: sandbox.startCommit,
        location: config.location ?? sandbox.sandboxDirectoryPath,
    });

    return {
        uri: opts.uri,
        id: config.id,
        name: config.name,
        sandbox,
        dependencies,
        ctx,
    };
}

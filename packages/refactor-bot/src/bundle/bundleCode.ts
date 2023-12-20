import assert from 'assert';
import type { Plugin } from 'rollup';

import { ImportNotAllowedError } from './importNotAllowedError';
import { rollupBuild } from './rollupBuild';
import { esbuildVirtual } from './rollupPluginEsbuild';
import rollupPluginVirtual from './rollupPluginVirtual';

export async function bundleCode(opts: {
    moduleName: string;
    code: string;
    allowedImports: string[];
    allowedDynamicImports: string[];
    plugins?: Plugin<unknown>[];
}) {
    const result = await rollupBuild({
        input: opts.moduleName,
        plugins: [
            opts.plugins,
            rollupPluginVirtual({
                [opts.moduleName]: opts.code,
            }),
            esbuildVirtual({
                target: 'node' + process.versions.node.split('.')[0],
                loader: 'ts',
                format: 'esm',
                platform: 'node',
                include: [
                    '**/*.js',
                    '**/*.cjs',
                    '**/*.mjs',
                    '**/*.ts',
                    '**/*.cts',
                    '**/*.mts',
                ],
                sourcemap: true,
            }),
            {
                name: 'import-not-allowed',
                resolveDynamicImport(id) {
                    if (
                        typeof id === 'string' &&
                        opts.allowedDynamicImports.includes(id)
                    ) {
                        return {
                            id: id,
                            external: true,
                        };
                    }

                    const moduleId = typeof id === 'string' ? id : undefined;
                    const hasAllowed = opts.allowedDynamicImports.length > 0;
                    const allowedText = opts.allowedDynamicImports.join(', ');
                    const message = hasAllowed
                        ? `Only following dynamic imports are allowed: ${allowedText}`
                        : `Dynamic importing is not allowed`;

                    throw new ImportNotAllowedError({
                        moduleId,
                        message,
                    });
                },
                resolveId(moduleId) {
                    if (opts.allowedImports.includes(moduleId)) {
                        return {
                            id: moduleId,
                            external: true,
                        };
                    }

                    const hasAllowed = opts.allowedImports.length > 0;
                    const allowedText = opts.allowedImports.join(', ');
                    const message = hasAllowed
                        ? `Only following imports are allowed: ${allowedText}`
                        : `Importing is not allowed`;

                    throw new ImportNotAllowedError({
                        moduleId,
                        message,
                    });
                },
            },
        ],
        external: [...opts.allowedImports, ...opts.allowedDynamicImports],
        output: {
            dir: '.',
            sourcemap: 'inline',
        },
    });

    const output = result[0]?.output?.[0];

    const { code, exports, fileName, map } = output || {};

    assert(code);
    assert(exports);
    assert(fileName);

    return {
        code,
        exports,
        fileName,
        map,
    };
}

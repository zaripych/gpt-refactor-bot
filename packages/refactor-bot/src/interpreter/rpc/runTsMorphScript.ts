import * as TsMorph from 'ts-morph';

import { bundleCode } from '../../bundle/bundleCode';
import type { FunctionsConfig } from '../../functions/types';
import { line } from '../../text/line';
import { createProject } from '../../ts-morph/project/createProject';
import { listProjects } from '../../ts-morph/project/listProjects';

async function importTsMorphScript(opts: {
    code: string;
    allowedImports: string[];
    moduleMap: Record<string, Record<string, unknown>>;
}) {
    // These imports are only available when node is started with
    // --experimental-vm-modules flag
    const { SourceTextModule, SyntheticModule } = await import('node:vm');

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!SourceTextModule) {
        throw new Error(line`
            SourceTextModule is not available, please start node with
            --experimental-vm-modules flag
        `);
    }

    const module = new SourceTextModule(opts.code, {
        identifier: 'evaluated.mts',
    });

    await module.link((specifier) => {
        if (
            specifier in opts.moduleMap &&
            opts.allowedImports.includes(specifier)
        ) {
            const moduleExports = opts.moduleMap[specifier];
            if (!moduleExports) {
                throw new Error(
                    `Module "${specifier}" is not allowed to be imported`
                );
            }
            return new SyntheticModule(Object.keys(moduleExports), function () {
                Object.entries(moduleExports).forEach(([key, value]) => {
                    this.setExport(key, value);
                });
            });
        }

        throw new Error(
            line`
                Importing "${specifier}" is not allowed, only following imports
                are allowed: ${opts.allowedImports.join(', ')}
            `
        );
    });

    await module.evaluate();

    return module.namespace as {
        mapProject: (
            project: ReturnType<typeof createProject>['project']
        ) => Promise<unknown>;
        reduce?: (results: unknown[]) => Promise<unknown>;
    };
}

export async function runTsMorphScript(opts: {
    args: {
        code: string;
    };
    config: FunctionsConfig;
}) {
    const { code, exports } = await bundleCode({
        moduleName: 'evaluated.mts',
        code: opts.args.code,
        allowedImports: ['ts-morph'],
        allowedDynamicImports: [],
    });

    if (!exports.includes('mapProject')) {
        throw new Error(line`
            "mapProject" function is not exported, expected to find a function
            named "mapProject" which receives a single argument of type
            "Project" from the "ts-morph" package
        `);
    }

    const { mapProject, reduce } = await importTsMorphScript({
        code,
        allowedImports: ['ts-morph'],
        moduleMap: {
            'ts-morph': TsMorph,
        },
    });

    const projectInfos = await listProjects(opts.config);

    const results: unknown[] = [];

    for (const info of projectInfos) {
        const { project } = createProject(info);

        const result = await mapProject(project);

        if (Array.isArray(result)) {
            results.push(...(result as unknown[]).filter(Boolean));
        } else {
            results.push(result);
        }
    }

    if (reduce) {
        return await reduce(results);
    }

    return results;
}

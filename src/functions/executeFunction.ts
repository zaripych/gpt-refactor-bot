import { realpath } from 'fs/promises';

import { makeDependencies } from './dependencies';
import type { FunctionsConfig } from './makeFunction';
import type { functions } from './registry';

type ArgumentsOf<Name extends string> = Parameters<
    Extract<(typeof functions)[number], { name: Name }>
>[0];

export const executeFunction = async <Name extends string>(
    opts:
        | ({
              name: Name;
              arguments: ArgumentsOf<Name>;
          } & Partial<FunctionsConfig>)
        | ({
              name: string;
              arguments: never;
          } & Partial<FunctionsConfig>)
) => {
    const { functions } = await import('./registry');

    const fn = functions.find((candidate) => candidate.name === opts.name);

    if (!fn) {
        throw new Error(`Cannot find function ${opts.name}`);
    }

    const dependencies = opts.dependencies ?? makeDependencies;

    const { findRepositoryRoot } = dependencies();

    const repositoryRoot = opts.repositoryRoot ?? (await findRepositoryRoot());

    const realRepositoryRoot = await realpath(repositoryRoot).catch(
        () => repositoryRoot
    );

    try {
        return await fn(opts.arguments as never, {
            strict: opts.strict ?? true,
            repositoryRoot: realRepositoryRoot,
            dependencies: opts.dependencies ?? makeDependencies,
        });
    } catch (err: unknown) {
        if (err instanceof Error) {
            console.error(err);
            return {
                error: {
                    message: err.message,
                },
            };
        }
        throw err;
    }
};

console.log(
    // 2
    await executeFunction({
        name: 'references',
        arguments: {
            identifier: 'readFile',
            initialFilePath: 'src/file-system/findPackageName.ts',
        },
        repositoryRoot:
            '/var/folders/kk/cj4kd1wx1rg16xq_jhdw75kc0000gn/T/.refactor-bot/sandboxes/replace-read-file-sync-unr87ijk',
    })
);

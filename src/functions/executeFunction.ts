import { realpath } from 'fs/promises';

import { logger } from '../logger/logger';
import { makeDependencies } from './dependencies';
import type { FunctionsConfig } from './makeFunction';
import type { functions } from './registry';

type FunctionNames = (typeof functions)[number]['name'];

type ResultOf<Name extends FunctionNames> = Awaited<
    ReturnType<Extract<(typeof functions)[number], { name: Name }>>
>;

export async function executeFunction<
    Opts extends { name: FunctionNames; arguments: unknown }
>(
    opts: Opts & Partial<FunctionsConfig>
): Promise<
    | ResultOf<Opts['name']>
    | {
          error?: {
              message: string;
          };
      }
>;
export async function executeFunction(
    opts: {
        name: string;
        arguments: unknown;
    } & Partial<FunctionsConfig>
): Promise<
    | unknown
    | {
          error?: {
              message: string;
          };
      }
>;
export async function executeFunction(
    opts: {
        name: string;
        arguments: unknown;
    } & Partial<FunctionsConfig>
): Promise<
    | unknown
    | {
          error?: {
              message: string;
          };
      }
> {
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
            logger.debug(err);
            return {
                error: {
                    message: err.message,
                },
            };
        }
        throw err;
    }
}

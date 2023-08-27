import { realpath } from 'fs/promises';

import { findRepositoryRoot } from '../file-system/findRepositoryRoot';
import { logger } from '../logger/logger';
import type { functions } from './registry';
import type { FunctionsConfig } from './types';

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

    const repositoryRoot = opts.repositoryRoot ?? (await findRepositoryRoot());

    const realRepositoryRoot = await realpath(repositoryRoot).catch(
        () => repositoryRoot
    );

    try {
        return await fn(opts.arguments as never, {
            repositoryRoot: realRepositoryRoot,
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

import type { Opts } from './makeFunction';
import type { functions } from './registry';

type ArgumentsOf<Name extends string> = Parameters<
    Extract<(typeof functions)[number], { name: Name }>
>[0];

export const executeFunction = async <Name extends string>(
    opts: {
        name: Name;
        arguments: ArgumentsOf<Name>;
    },
    callOpts?: Opts
) => {
    const { functions } = await import('./registry');

    const fn = functions.find((candidate) => candidate.name === opts.name);

    if (!fn) {
        throw new Error(`Cannot find function ${opts.name}`);
    }

    try {
        return await fn(opts.arguments as never, callOpts);
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

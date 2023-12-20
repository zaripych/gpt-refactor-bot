import { z } from 'zod';

import { makeFunction } from '../functions/makeFunction';
import { markdown } from '../markdown/markdown';
import { startInterpreterRpc } from './rpc/startInterpreterRpc';

const argsSchema = z.object({
    code: z.string(),
});

export const runTsMorphScriptFunction = makeFunction({
    name: 'runTsMorphScript',
    description: markdown`
        Evaluates JavaScript/TypeScript code which has access to "ts-morph"
        library. The code must be an ESM module that export a function called
        "mapProject" which receives a single argument that represents an
        initialized "Project" from "ts-morph" library.

        The function must return a value.

        The function is then executed for every TypeScript project in the
        repository and results are flat mapped into an array.

        The module also can export another function named "reduce". The function
        receives an array which is a combination of all results of "mapProject"
        functions. If the "reduce" function is exported the results of the
        "mapProject" function are passed to it and the return value of the
        "reduce" function is returned as the result of the "runTsMorphScript"
        function.

        This allows to perform analysis that spans the entire repository and
        aggregate over the data.
    `,
    argsSchema,
    resultSchema: z.unknown(),
    implementation: async (args, config) => {
        const { runTsMorphScript, teardown } = await startInterpreterRpc();

        try {
            return await runTsMorphScript({
                args,
                config,
            });
        } finally {
            teardown();
        }
    },
});

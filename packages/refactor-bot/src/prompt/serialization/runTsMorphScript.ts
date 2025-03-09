import { z } from 'zod';

const serializeArgument = (args: string) => {
    const result = z
        .string()
        .transform((text) => JSON.parse(text) as unknown)
        .pipe(
            z
                .object({
                    code: z.string(),
                })
                .passthrough()
        )
        .parse(args);

    return {
        code: result.code,
        language: 'typescript',
    };
};

const deserializeArgument = (code: string) => {
    return JSON.stringify({
        code,
    });
};

export const runTsMorphScriptArgumentsSerializers = {
    serializeArgument,
    deserializeArgument,
};

import { zodToJsonSchema } from 'zod-to-json-schema';

import type { FunctionDefinition } from '../chat-gpt/api';

export async function includeFunctions(): Promise<FunctionDefinition[]> {
    const { functions } = await import('./registry');

    return functions.map((fn) => ({
        name: fn.name,
        description: `${
            fn.description
        }\n\nThe function returns data with the following schema:\n\n${JSON.stringify(
            zodToJsonSchema(fn.resultSchema)
        )}`,
        parameters: zodToJsonSchema(fn.argsSchema),
    }));
}

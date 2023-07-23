import { zodToJsonSchema } from 'zod-to-json-schema';

import type { FunctionDefinition } from '../chat-gpt/api';

export async function includeFunctions(): Promise<FunctionDefinition[]> {
    const { functions } = await import('./registry');

    return functions.map((fn) => ({
        name: fn.name,
        description: fn.description,
        parameters: zodToJsonSchema(fn.argsSchema),
    }));
}

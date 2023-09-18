import { zodToJsonSchema } from 'zod-to-json-schema';

import type { FunctionDefinition } from '../chat-gpt/api';

/**
 * Selects functions from the registry by name and constructs
 * a data structure that can be used to make these functions
 * available to the Chat GPT API.
 *
 * We use zodToJsonSchema to convert the Zod schema to a JSON
 * schema, which is what the Chat GPT API expects.
 */
export async function includeFunctions(
    allowedFunctions: string[] | 'all'
): Promise<FunctionDefinition[]> {
    const { functions } = await import('./registry');

    return functions
        .filter(
            (fn) =>
                allowedFunctions === 'all' || allowedFunctions.includes(fn.name)
        )
        .map((fn) => ({
            name: fn.name,
            description: fn.description,
            parameters: zodToJsonSchema(fn.argsSchema),
        }));
}

import { z } from 'zod';

import { markdown } from '../markdown/markdown';
import { makeDependencies } from './dependencies';
import { promptWithFunctions } from './promptWithFunctions';

export const enrichObjectiveResultSchema = z.object({
    /**
     * Objective with extra information obtained using functions executed
     * against the repository at the time before refactoring started.
     */
    enrichedObjective: z.string(),
    spentCents: z.number(),
});

export type EnrichObjectiveResponse = z.infer<
    typeof enrichObjectiveResultSchema
>;

const systemPrompt = markdown`
Think step by step. Be concise and to the point. Do not make assumptions other than what was given in the instructions.
`;

const enrichPromptText = (originalObjective: string) =>
    markdown`
These are the original instructions:

${originalObjective}

Given the above instructions that represent an objective, use the tool box directly via OpenAI function calling to obtain extra information. Feel free to make multiple calls, if needed.

The extra information is meant to help to determine the steps needed to achieve the objective, but doesn't need to describe the steps. Extra information should be concise, should not make conclusions or provide advice, it should contain just facts that are retrieved from results of the function calls. Do not include any information that is not relevant to the objective.

Produce retrieved extra information as a final message.
    `;

export async function enrichObjective(
    input: {
        objective: string;
        budgetCents: number;
        sandboxDirectoryPath: string;
    },
    getDeps = makeDependencies
): Promise<EnrichObjectiveResponse> {
    const { includeFunctions } = getDeps();

    const userPrompt = enrichPromptText(input.objective);

    const { messages, spentCents } = await promptWithFunctions({
        systemPrompt,
        userPrompt,
        budgetCents: input.budgetCents,
        functions: await includeFunctions(),
        functionsConfig: {
            repositoryRoot: input.sandboxDirectoryPath,
            dependencies: getDeps,
        },
    });

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) {
        throw new Error(`No messages found after prompt`);
    }
    if (lastMessage.role !== 'assistant') {
        throw new Error(`Expected last message to be from assistant`);
    }
    if ('functionCall' in lastMessage) {
        throw new Error(`Expected last message to not be a function-call`);
    }

    return {
        spentCents,
        enrichedObjective: [input.objective, lastMessage.content].join('\n\n'),
    };
}
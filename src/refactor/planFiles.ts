import { z } from 'zod';

import { markdown } from '../markdown/markdown';
import { makeDependencies } from './dependencies';
import { promptWithFunctions } from './promptWithFunctions';

export const planFilesResultSchema = z.object({
    /**
     * List of files that need refactoring to focus on one file at a time.
     */
    plannedFiles: z.array(z.string()),
    spentCents: z.number(),
});

export type PlanFilesResponse = z.infer<typeof planFilesResultSchema>;

const systemPrompt = markdown`
Think step by step. Be concise and to the point. Do not make assumptions other than what was given in the instructions.
`;

const planFilesPromptText = (objective: string) =>
    markdown`
${objective}

Given the above objective produce a list of file paths to be edited. Return one file path per line in your response. File paths should be surrounded by a backtick. File paths should be relative to repository root. The result must be a numbered list in the format:

#. \`path/to/file.ts\`
#. \`path/to/another/file.ts\`

The number of each entry must be followed by a period. If your list is empty, write "There are no tasks to add at this time.". Unless the list is empty, do not include any headers before the numbered list or follow the numbered list with any other output.
    `;

export async function planFiles(
    input: {
        objective: string;
        budgetCents: number;
        sandboxDirectoryPath: string;
    },
    getDeps = makeDependencies
): Promise<PlanFilesResponse> {
    const { includeFunctions } = getDeps();

    const userPrompt = planFilesPromptText(input.objective);

    const { messages, spentCents } = await promptWithFunctions({
        systemPrompt,
        userPrompt,
        functions: await includeFunctions(),
        budgetCents: input.budgetCents,
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

    const plannedFiles: string[] = [];

    const regex = /^\s*\d+\.\s*[`]([^`]+)[`]\s*/gm;

    let result = regex.exec(lastMessage.content);

    while (result) {
        const filePath = result[1];
        if (!filePath) {
            continue;
        }

        plannedFiles.push(filePath);

        result = regex.exec(lastMessage.content);
    }

    return {
        spentCents,
        plannedFiles,
    };
}

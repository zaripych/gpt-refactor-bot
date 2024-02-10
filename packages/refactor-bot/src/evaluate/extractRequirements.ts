import { z } from 'zod';

import type { CacheStateRef } from '../cache/types';
import type { RegularAssistantMessage } from '../chat-gpt/api';
import { functionsRepositorySchema } from '../functions/prepareFunctionsRepository';
import { llmDependenciesSchema } from '../llm/llmDependencies';
import { markdown } from '../markdown/markdown';
import { formatZodError } from '../prompt-formatters/formatZodError';
import { prompt } from '../refactor/prompt';
import { parseJsonResponse } from '../response-parsers/parseJsonResponse';
import { format } from '../text/format';
import { ensureHasOneElement } from '../utils/hasOne';

export const extractRequirementsInput = z.object({
    objective: z.string(),
    choices: z.number().optional(),
    temperature: z.number().optional(),

    llmDependencies: llmDependenciesSchema,
    functionsRepository: functionsRepositorySchema,
});

const requirementsArraySchema = z.array(z.string()).nonempty();

export const extractRequirementsResult = z.object({
    key: z.string().optional(),
    choices: z.array(
        z.object({
            requirements: requirementsArraySchema,
        })
    ),
});

const systemPromptText = markdown`
    Think step by step. Be concise and to the point. Do not make assumptions and
    follow instructions exactly.
`;

const promptText = (opts: { objective: string }) =>
    format(
        markdown`
            <objective>
            %objective%
            </objective>

            Given above objective, split it into requirements.

            Do not modify the requirements. Do not add new requirements. Do not
            try to guess what the implementation would look like. Do not look
            too far ahead. Do not rephrase the requirements. Only extract the
            minimum which is explicitly specified. Do not include implied
            requirements. There should be a minimum of 1 requirements as a
            result. Strive to minimize the number of requirements. Requirements
            should not be redundant. There should be no duplicate requirements.

            Return list of requirements in the following format:

            ~~~json
            ["Requirement 1", "Requirement 2"]
            ~~~
        `,
        {
            objective: opts.objective,
        }
    );

export const extractRequirements = async (
    input: z.input<typeof extractRequirementsInput>,
    ctx?: CacheStateRef
) => {
    const { objective } = input;

    const validateResponse = (message: RegularAssistantMessage) =>
        parseJsonResponse(message.content, requirementsArraySchema);

    const result = await prompt(
        {
            ...input,
            preface: systemPromptText,
            prompt: promptText({
                objective,
            }),
            temperature: input.temperature ?? 0.2,
            choices: input.choices,
            allowedFunctions: [],
            shouldStop: (message) => {
                try {
                    validateResponse(message);
                    return true;
                } catch (err) {
                    if (err instanceof z.ZodError) {
                        return formatZodError({
                            error: err,
                        });
                    }
                    return String(err);
                }
            },
        },
        ctx
    );

    return {
        key: result.key,
        choices: ensureHasOneElement(
            result.choices.map((choice) => ({
                requirements: validateResponse(choice.resultingMessage),
            }))
        ),
    };
};

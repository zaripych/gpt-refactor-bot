import { z } from 'zod';

import type { CacheStateRef } from '../cache/types';
import type { RegularAssistantMessage } from '../chat-gpt/api';
import { functionsRepositorySchema } from '../functions/prepareFunctionsRepository';
import { llmDependenciesSchema } from '../llm/llmDependencies';
import { markdown } from '../markdown/markdown';
import { formatBulletList } from '../prompt-formatters/formatBulletList';
import { formatZodError } from '../prompt-formatters/formatZodError';
import { prompt } from '../refactor/prompt';
import { parseJsonResponse } from '../response-parsers/parseJsonResponse';
import { format } from '../text/format';
import { ensureHasOneElement } from '../utils/hasOne';

const requirementsArraySchema = z.array(z.string()).nonempty();

export const filterRequirementsInput = z.object({
    requirements: requirementsArraySchema,
    filePath: z.string(),
    temperature: z.number().optional(),
    choices: z.number().optional(),

    llmDependencies: llmDependenciesSchema,
    functionsRepository: functionsRepositorySchema,
});

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

const promptText = (opts: {
    filePath: string;
    requirements: z.output<typeof requirementsArraySchema>;
}) =>
    format(
        markdown`
            <requirements>
            %requirements%
            </requirements>

            Given above list of requirements, filter out the requirements that
            are not relevant to the file \`%filePath%\`. Filtering out should
            only be done if the requirement explicitly mentions the file it
            applies to. If the requirement does not mention a file, it should be
            kept in the list.

            Do not modify the requirements. Do not add new requirements. Do not
            try to guess what the implementation would look like. Do not look
            too far ahead. Do not rephrase the requirements.

            Return list of requirements in the following format:

            ~~~json
            ["Requirement 1", "Requirement 2"]
            ~~~
        `,
        {
            requirements: formatBulletList({
                items: ensureHasOneElement(opts.requirements),
                heading: `List of requirements:`,
            }),
            filePath: opts.filePath,
        }
    );

export const filterRequirements = async (
    input: z.input<typeof filterRequirementsInput>,
    ctx?: CacheStateRef
) => {
    const { requirements, filePath } = input;

    const validateResponse = (message: RegularAssistantMessage) =>
        parseJsonResponse({
            response: message.content,
            schema: requirementsArraySchema,
        });

    const result = await prompt(
        {
            ...input,
            preface: systemPromptText,
            prompt: promptText({
                requirements,
                filePath,
            }),
            temperature: input.temperature ?? 0.2,
            choices: input.choices,
            allowedFunctions: [],
            shouldStop: ({ message }) => {
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

import { z } from 'zod';

import type { CacheStateRef } from '../cache/types';
import { extractRequirements } from '../evaluate/extractRequirements';
import { functionsRepositorySchema } from '../functions/prepareFunctionsRepository';
import { llmDependenciesSchema } from '../llm/llmDependencies';
import {
    determineFilesToEdit,
    determineFilesToEditResultSchema,
} from './filesToEdit';

export const retrieveParametersInputSchema = z.object({
    objective: z.string(),
    filesToEdit: z.array(z.string()).nonempty().optional(),
    sandboxDirectoryPath: z.string(),

    llmDependencies: llmDependenciesSchema,
    functionsRepository: functionsRepositorySchema,
});

export const retrieveParametersResultSchema =
    determineFilesToEditResultSchema.augment({
        requirements: z.array(z.string()).nonempty(),
    });

export const retrieveParameters = async (
    input: z.input<typeof retrieveParametersInputSchema>,
    ctx?: CacheStateRef
) => {
    const { filesToEdit } = input.filesToEdit
        ? {
              filesToEdit: input.filesToEdit,
          }
        : await determineFilesToEdit(input, ctx);

    const { choices } = await extractRequirements(
        {
            ...input,
            choices: 2,
        },
        ctx
    );

    const requirements = choices.reduce(
        (acc, choice) =>
            choice.requirements.length > acc.length ? acc : choice.requirements,
        choices[0].requirements
    );

    return {
        filesToEdit,
        requirements,
    };
};

import assert from 'assert';
import { z } from 'zod';

import { evaluateFileScore } from '../evaluate/evaluateFileScore';
import { dispatch } from '../event-bus';
import { functionsRepositorySchema } from '../functions/prepareFunctionsRepository';
import { gitResetHard } from '../git/gitResetHard';
import { gitRevParse } from '../git/gitRevParse';
import { llmDependenciesSchema } from '../llm/llmDependencies';
import { logger } from '../logger/logger';
import { acceptedEdit } from './actions/acceptedEdit';
import { discardedEdit } from './actions/discardedEdit';
import { checkDependenciesSchema } from './code-checking/prepareCodeCheckingDeps';
import { formatDependenciesSchema } from './code-formatting/prepareCodeFormattingDeps';
import { refactorFile } from './refactorFile';
import type { RefactorFilesResult } from './types';
import { refactorConfigSchema } from './types';

export const refactorBatchInputSchema = z.object({
    objective: z.string(),
    requirements: z.array(z.string()).nonempty(),
    plannedFiles: z.array(z.string()),
    startCommit: z.string(),
    sandboxDirectoryPath: z.string(),

    evaluate: refactorConfigSchema.shape.evaluate,
    evaluateMinScore: refactorConfigSchema.shape.evaluateMinScore,

    llmDependencies: llmDependenciesSchema,
    checkDependencies: checkDependenciesSchema,
    formatDependencies: formatDependenciesSchema,
    functionsRepository: functionsRepositorySchema,
});

export const refactorBatch = async (
    input: z.input<typeof refactorBatchInputSchema>,
    deps = { dispatch }
) => {
    const { plannedFiles } = await refactorBatchInputSchema.parseAsync(input);

    const accepted: RefactorFilesResult['accepted'] = [];
    const discarded: RefactorFilesResult['discarded'] = [];

    for (const filePath of plannedFiles) {
        const beforeRefactorCommit = await gitRevParse({
            location: input.sandboxDirectoryPath,
            ref: 'HEAD',
        });

        const refactorFileResult = await refactorFile({
            filePath,
            ...input,
        });

        const { file } = refactorFileResult;

        let shouldAccept =
            file.status === 'success' && Boolean(file.lastCommit);

        if (shouldAccept && input.evaluate) {
            const lastCommit = file.lastCommit;
            assert(lastCommit);

            refactorFileResult.evaluation = await evaluateFileScore({
                ...input,
                filePath: file.filePath,
                commitBeforeChanges: beforeRefactorCommit,
                commit: lastCommit,
                choices: 3,
            });

            shouldAccept =
                refactorFileResult.evaluation.score >=
                (input.evaluateMinScore ?? 0.5);
        }

        if (shouldAccept) {
            if (file.lastCommit) {
                const currentCommit = await gitRevParse({
                    location: input.sandboxDirectoryPath,
                    ref: 'HEAD',
                });

                if (currentCommit !== file.lastCommit) {
                    logger.info('Resetting to', file.lastCommit);

                    await gitResetHard({
                        location: input.sandboxDirectoryPath,
                        ref: file.lastCommit,
                    });
                }
            }

            accepted.push(refactorFileResult);

            deps.dispatch(acceptedEdit(refactorFileResult));
        } else {
            const currentCommit = await gitRevParse({
                location: input.sandboxDirectoryPath,
                ref: 'HEAD',
            });

            if (currentCommit !== beforeRefactorCommit) {
                logger.warn(
                    'Resetting to previous commit',
                    beforeRefactorCommit
                );

                await gitResetHard({
                    location: input.sandboxDirectoryPath,
                    ref: beforeRefactorCommit,
                });
            }

            discarded.push(refactorFileResult);

            deps.dispatch(discardedEdit(refactorFileResult));
        }
    }

    return {
        accepted,
        discarded,
    };
};

import { z } from 'zod';

import type { CacheStateRef } from '../cache/types';
import { gitShowFile } from '../git/gitShowFile';
import { gitShowFileCommitRangeSummary } from '../git/gitShowFileCommitSummary';
import { avg } from '../math/avg';
import {
    evaluateFileChanges,
    evaluateFileChangesInput,
} from './evaluateFileChanges';
import { evaluateUnchangedFile } from './evaluateUnchangedFile';

export const evaluateFileScoreSchema = evaluateFileChangesInput
    .omit({
        fileContentsAfter: true,
        fileContentsBefore: true,
        fileDiff: true,
    })
    .augment({
        commit: z.string().optional(),
        commitBeforeChanges: z.string(),
    });

export const evaluateFileScoreResultSchema = z.object({
    key: z.string().optional(),
    score: z.number(),
});

/**
 * Determines if the file has changed since the last commit and evaluates the
 * changes if so, then aggregates the results into a single score.
 */
export const evaluateFileScore = async (
    input: z.input<typeof evaluateFileScoreSchema>,
    ctx?: CacheStateRef
) => {
    const { sandboxDirectoryPath, commit, commitBeforeChanges, filePath } =
        input;

    const changeInfo = commit
        ? await gitShowFileCommitRangeSummary({
              location: sandboxDirectoryPath,
              filePath: filePath,
              from: commitBeforeChanges,
              to: commit,
          })
        : undefined;

    const evaluationResults =
        changeInfo && changeInfo.fileDiff
            ? await evaluateFileChanges(
                  {
                      ...input,
                      ...changeInfo,
                  },
                  ctx
              )
            : await evaluateUnchangedFile(
                  {
                      ...input,
                      fileContents: await gitShowFile({
                          location: sandboxDirectoryPath,
                          filePath: input.filePath,
                          ref: input.commitBeforeChanges,
                      }),
                  },
                  ctx
              );

    const scoreChoices = evaluationResults.choices.map((choice) => {
        const hit = choice.requirements.filter((r) => r.satisfied).length;

        const score = hit / choice.requirements.length;

        return {
            score,
            summary: choice.summary,
        };
    });

    return {
        key: evaluationResults.key,
        score: avg(scoreChoices.map((choice) => choice.score)),
    };
};

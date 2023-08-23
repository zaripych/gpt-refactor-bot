import { join } from 'path';

import { findRepositoryRoot } from '../file-system/findRepositoryRoot';
import { gitCheckoutNewBranch } from '../git/gitCheckoutNewBranch';
import { gitFetch } from '../git/gitFetch';
import { gitForceCreateBranch } from '../git/gitForceCreateBranch';
import { gitRevParse } from '../git/gitRevParse';
import { glowFormat } from '../markdown/glowFormat';
import { markdown } from '../markdown/markdown';
import { pipeline } from '../pipeline/pipeline';
import { randomText } from '../utils/randomText';
import { checkoutSandbox } from './checkoutSandbox';
import { makeDependencies } from './dependencies';
import { enrichObjective } from './enrichObjective';
import { refactorGoal } from './refactorGoal';
import { type RefactorConfig, refactorConfigSchema } from './types';

const createPipe = () => {
    const pipe = pipeline(refactorConfigSchema)
        .append(checkoutSandbox)
        .append(enrichObjective)
        .combineLast((input, result) => ({
            ...input,
            ...result,
            objective: result.enrichedObjective,
        }))
        .append(refactorGoal);

    return pipe;
};

async function loadRefactorState(
    opts: {
        id?: string;
        config: RefactorConfig;
    },
    getDeps = makeDependencies
) {
    const { findRepositoryRoot } = getDeps();

    const pipe = createPipe();

    const root = await findRepositoryRoot();

    if (opts.id) {
        const location = join(
            root,
            `.refactor-bot/refactors/${opts.config.name}/state/`,
            opts.id
        );

        return {
            pipe,
            location,
            id: opts.id,
        };
    } else {
        const id = randomText(8);

        return {
            pipe,
            location: join(
                root,
                `.refactor-bot/refactors/${opts.config.name}/state/`,
                id
            ),
            id,
        };
    }
}

type RefactorResult = Awaited<
    ReturnType<ReturnType<typeof createPipe>['transform']>
>;

const currentRepositoryRefactoringReport = async (
    opts: RefactorResult & {
        successBranch: string;
    }
) => {
    const { accepted, discarded, successBranch, sandboxDirectoryPath } = opts;

    const perFile = Object.entries(accepted)
        .map(([file, results]) => {
            const firstCommit = results[0]?.steps[0]?.commit?.substring(0, 7);
            const lastCommit = results[
                results.length - 1
            ]?.lastCommit?.substring(0, 7);
            return `# ${file}\ngit cherry-pick -n ${String(
                firstCommit
            )}^..${String(lastCommit)}`;
        })
        .join('\n');

    const firstCommits = Object.entries(discarded)
        .map(([file, results]) => {
            const firstCommit = results[0]?.steps[0]?.commit?.substring(0, 7);
            return `# ${file}\ngit cherry-pick -n ${String(firstCommit)}`;
        })
        .join('\n');

    return (
        await glowFormat({
            input: markdown`
# Refactoring completed

Sandbox directory path:

\`SANDBOX_PATH\`

Successfully refactored:

${Object.keys(accepted)
    .map((file, i) => `${i + 1}. \`${file}\``)
    .join('\n')}

Failed to refactor:

${Object.keys(discarded)
    .map((file, i) => `${i + 1}. \`${file}\``)
    .join('\n')}

The code passing checks has been checked out as \`${successBranch}\` branch for you. So you can now try following command to merge changes into your current branch:

## Merge directly

\`\`\`sh
git merge ${successBranch}
\`\`\`

## Interactively

\`\`\`sh
git checkout -p ${successBranch}
\`\`\`

## Individually per file

\`\`\`sh
${perFile}
\`\`\`

## First commits of failed files

These are least invasive commits focused on the goal which didn't pass checks. You can try to fix them manually.

\`\`\`sh
${firstCommits}
\`\`\`

**NOTE**: Alternatively, you can also ask the bot to create a pull request for you by passing \`--pull-request\` flag to the \`refactor\` command.
`,
        })
    ).replace(
        /**
         * @note ensure the path is not broken by padding
         */
        'SANDBOX_PATH',
        sandboxDirectoryPath
    );
};

export async function refactor(
    opts: {
        id?: string;
        config: RefactorConfig;
    },
    getDeps = makeDependencies
) {
    const { logger } = getDeps();

    const { pipe, location, id } = await loadRefactorState(opts, getDeps);

    logger.debug(
        `Starting refactor with id "${id}", process id: "${process.pid}"`
    );

    const persistence = {
        location,
    };

    try {
        process.on('SIGINT', () => {
            pipe.abort();
        });

        const result = await pipe.transform(opts.config, persistence);

        const lastCommit = await gitRevParse({
            location: result.sandboxDirectoryPath,
            ref: 'HEAD',
        });

        if (
            lastCommit !== result.startCommit &&
            Object.keys(result.accepted).length > 0
        ) {
            const successBranch = `refactor-bot/${opts.config.name}-${id}`;

            await gitCheckoutNewBranch({
                location: result.sandboxDirectoryPath,
                branchName: successBranch,
            });

            if (!result.repository) {
                const localRoot = await findRepositoryRoot();

                await gitFetch({
                    location: localRoot,
                    from: result.sandboxDirectoryPath,
                    refs: [successBranch],
                });

                await gitForceCreateBranch({
                    location: localRoot,
                    branchName: successBranch,
                    ref: 'FETCH_HEAD',
                });

                console.log(
                    await currentRepositoryRefactoringReport({
                        ...result,
                        successBranch,
                    })
                );
            }
        }

        return {
            accepted: result.accepted,
            discarded: result.discarded,
        };
    } finally {
        await pipe.clean(persistence);
    }
}

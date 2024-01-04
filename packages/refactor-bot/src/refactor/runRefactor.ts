import { mkdir, writeFile } from 'fs/promises';
import { globby } from 'globby';
import orderBy from 'lodash-es/orderBy';
import { basename, dirname } from 'path';
import prompts from 'prompts';
import { z } from 'zod';

import { ConfigurationError } from '../errors/configurationError';
import { findRepositoryRoot } from '../file-system/findRepositoryRoot';
import { extractErrorInfo } from '../logger/extractErrorInfo';
import { formatObject } from '../logger/formatObject';
import { glowFormat } from '../markdown/glowFormat';
import { markdown } from '../markdown/markdown';
import { goToEndOfFile } from '../prompt/editor';
import { format } from '../text/format';
import { line } from '../text/line';
import { hasOneElement } from '../utils/hasOne';
import { loadRefactorConfigs } from './loadRefactors';
import { refactor } from './refactor';
import type { RefactorConfig } from './types';

const validateUsingSchema =
    <T extends z.ZodType>(schema: T) =>
    (value: z.infer<T>) => {
        const result = schema.safeParse(value);
        if (result.success) {
            return true;
        } else {
            return result.error.issues[0]?.message || result.error.message;
        }
    };

async function promptForConfig(refactors: RefactorConfig[]) {
    const answers = (await prompts({
        name: 'config',
        message: 'Select the refactor to run',
        type: 'select',
        choices: [
            ...refactors.map((config) => ({
                title: config.name,
                value: config,
            })),
            {
                title: 'New refactor...',
                value: 'new',
            },
        ],
    })) as {
        config?: RefactorConfig | 'new';
    };

    if (answers.config === 'new') {
        const answers = (await prompts({
            name: 'name',
            message: 'Enter a short name for the refactor',
            type: 'text',
            validate: validateUsingSchema(
                z.string().regex(/^[a-zA-Z0-9-]+$/, {
                    message:
                        'Must be a valid directory name matching /^[a-zA-Z0-9-]+$/',
                })
            ),
        })) as {
            name: string;
        };

        if (!answers.name) {
            process.exit(0);
        }

        await mkdir(`.refactor-bot/refactors/${answers.name}`, {
            recursive: true,
        });

        const goalMdFilePath = `.refactor-bot/refactors/${answers.name}/goal.md`;

        await writeFile(
            goalMdFilePath,
            `
\`\`\`yaml
# For information about possible options have a look at the code:
# https://github.com/zaripych/refactor-bot/blob/main/src/refactor/types.ts#L5
budgetCents: 100
model: gpt-4
\`\`\`

> Please describe the refactoring in here, save the file and restart the command to continue...
`,
            'utf-8'
        );

        if (!(await goToEndOfFile(goalMdFilePath))) {
            console.log(
                await glowFormat({
                    input: `# Created a file

at \`${goalMdFilePath}\`

Please describe the refactoring in the file, save the file and restart the command to continue.
`,
                })
            );
        }

        process.exit(0);
    }

    if (!answers.config) {
        process.exit(0);
    }

    return {
        config: answers.config,
    };
}

async function determineConfig(opts: {
    id?: string;
    name?: string;
    configs: RefactorConfig[];
}) {
    if (opts.name) {
        const config = opts.configs.find((config) => config.name === opts.name);

        if (!config) {
            throw new ConfigurationError(
                `Cannot find config with name "${opts.name}"`
            );
        }

        return {
            config,
        };
    }

    if (opts.id) {
        const repoRoot = await findRepositoryRoot();

        const init = await globby(
            `.refactor-bot/refactors/*/state/${opts.id}/*`,
            {
                cwd: repoRoot,
            }
        );

        if (!hasOneElement(init)) {
            throw new ConfigurationError(
                `Cannot find files to load state from for id "${opts.id}"`
            );
        }

        const name = basename(dirname(dirname(dirname(init[0]))));

        const config = opts.configs.find((config) => config.name === name);

        if (!config) {
            throw new ConfigurationError(
                `No refactor config has been found, please provide id for an existing refactor`
            );
        }

        return {
            config: {
                ...config,
                id: opts.id,
            },
        };
    }

    return await promptForConfig(opts.configs);
}

type RefactorResult = Awaited<ReturnType<typeof refactor>>;

const currentRepositoryRefactoringReport = async (
    opts: RefactorResult & {
        successBranch: string;
    }
) => {
    const { accepted, discarded, successBranch, sandboxDirectoryPath } = opts;

    const perFile = Object.entries(accepted)
        .flatMap(([file, results]) => {
            const firstCommit = results[0]?.steps[0]?.commit?.substring(0, 7);
            const lastCommit = results[
                results.length - 1
            ]?.lastCommit?.substring(0, 7);
            if (!firstCommit || !lastCommit) {
                return [];
            }
            return [
                `# ${file}\ngit cherry-pick -n ${firstCommit}^..${lastCommit}`,
            ];
        })
        .join('\n');

    const firstCommits = Object.entries(discarded)
        .flatMap(([file, results]) => {
            const firstCommit = results[0]?.steps[0]?.commit?.substring(0, 7);
            if (!firstCommit) {
                return [`# ${file}\n# No commits found for this file`];
            }
            return [`# ${file}\ngit cherry-pick -n ${firstCommit}`];
        })
        .join('\n');

    const failedToRefactor =
        Object.keys(discarded).length > 0
            ? markdown`
                Failed to refactor:

                ${Object.keys(discarded)
                    .map((file, i) => `${i + 1}. \`${file}\``)
                    .join('\n')}
            `
            : '';

    let firstCommitsOfFailures = '';
    if (Object.keys(discarded).length > 0 && firstCommits) {
        firstCommitsOfFailures = format(
            markdown`
                ## First commits of failed files

                These are least invasive commits focused on the goal which
                didn't pass checks. You can try to fix them manually.

                ~~~sh
                %firstCommits%
                ~~~
            `,
            { firstCommits }
        );
    }

    const successfullyRefactored = Object.keys(accepted)
        .map((file, i) => `${i + 1}. \`${file}\``)
        .join('\n');

    return format(
        await glowFormat({
            input: format(
                markdown`
                    # Refactoring completed

                    Sandbox directory path:

                    \`$sandboxDirectoryPath$\`

                    Successfully refactored:

                    %successfullyRefactored%

                    %failedToRefactor%

                    The code passing checks has been checked out as
                    \`%successBranch%\` branch for you. So you can now try
                    following command to merge changes into your current branch:

                    ## Merge directly

                    ~~~sh
                    git merge %successBranch%
                    ~~~

                    ## Interactively

                    ~~~sh
                    git checkout -p %successBranch%
                    ~~~

                    ## Individually per file

                    ~~~sh
                    %perFile%
                    ~~~

                    %firstCommitsOfFailures%
                `,
                {
                    successfullyRefactored,
                    failedToRefactor,
                    successBranch,
                    perFile,
                    firstCommitsOfFailures,
                }
            ),
        }),
        {
            /**
             * @note ensure the path is not broken by padding
             */
            sandboxDirectoryPath,
        },
        {
            prefix: '$',
        }
    );
};

const currentRepositoryFailedRefactoringReport = async (
    opts: RefactorResult
) => {
    const { discarded, sandboxDirectoryPath } = opts;

    const firstCommits = Object.entries(discarded)
        .flatMap(([file, results]) => {
            const firstCommit = results[0]?.steps[0]?.commit?.substring(0, 7);
            if (!firstCommit) {
                return [`# ${file}\n# No commits found for this file`];
            }
            return [`# ${file}\ngit cherry-pick -n ${firstCommit}`];
        })
        .join('\n');

    const failedToRefactor = Object.keys(discarded)
        .map((file, i) => `${i + 1}. \`${file}\``)
        .join('\n');

    return format(
        await glowFormat({
            input: format(
                markdown`
                    # Refactoring failed

                    Sandbox directory path:

                    \`$sandboxDirectoryPath$\`

                    Failed to refactor:

                    %failedToRefactor%

                    ## First commits of failed files

                    These are least invasive commits focused on the goal which
                    didn't pass checks. You can try to fix them manually.

                    ~~~sh
                    %firstCommits%
                    ~~~
                `,
                {
                    failedToRefactor,
                    firstCommits,
                }
            ),
        }),
        {
            /**
             * @note ensure the path is not broken by padding
             */
            sandboxDirectoryPath,
        },
        {
            prefix: '$',
        }
    );
};

const currentRepositoryPlanningEmptyReasonReport = async (
    opts: RefactorResult
) => {
    const { planFilesResults, sandboxDirectoryPath } = opts;

    const emptyPlanReason = planFilesResults[0]?.rawResponse || '';

    return format(
        await glowFormat({
            input: format(
                markdown`
                    # Refactoring failed

                    Sandbox directory path:

                    \`$sandboxDirectoryPath$\`

                    ## No files require changes.

                    %emptyPlanReason%
                `,
                {
                    emptyPlanReason,
                }
            ),
        }),
        {
            /**
             * @note ensure the path is not broken by padding
             */
            sandboxDirectoryPath,
        },
        {
            prefix: '$',
        }
    );
};

const unhandledErrorReport = async (opts: { error: Error }) => {
    console.log(
        await glowFormat({
            input: format(
                markdown`
                    # Unhandled error

                    ~~~
                    %errorDetails%
                    ~~~
                `,
                {
                    errorDetails: formatObject(extractErrorInfo(opts.error), {
                        indent: '',
                    }),
                }
            ),
        })
    );
};

const configurationErrorReport = async (opts: {
    error: ConfigurationError;
}) => {
    console.log(
        await glowFormat({
            input: format(
                markdown`
                    # Configuration error

                    %errorMessage%

                    ~~~
                    %errorDetails%
                    ~~~
                `,
                {
                    errorMessage: opts.error.message,
                    errorDetails: formatObject(extractErrorInfo(opts.error), {
                        indent: '',
                    }),
                }
            ),
        })
    );
};

const analyticsReport = async (opts: {
    result: Awaited<ReturnType<typeof refactor>>;
    costs: boolean;
    performance: boolean;
}) => {
    if (opts.costs) {
        const total = opts.result.costsByStep.total.totalPrice;
        const costs = Object.entries(opts.result.costsByStep)
            .map(([step, costs]) => ({
                step,
                costs,
            }))
            .filter((data) => data.step !== 'total' && data.step !== 'unknown');

        const orderedCosts = orderBy(costs, ['costs.totalPrice'], ['desc']);

        const warning =
            total === 0
                ? '\n' +
                  line`
                      **NOTE** The costs cannot be collected if we cache high
                      level steps. Try running the refactor with following
                      options: \`--enable-cache-for chat exec check auto-fix\`
                  `
                : ``;

        console.log(
            await glowFormat({
                input: format(
                    markdown`
                        # Cost

                        Total cost: %total% USD

                        %costByStep%

                        %warning%
                    `,
                    {
                        total: total.toFixed(3),
                        costByStep: orderedCosts
                            .filter(
                                /**
                                 * Exclude low level steps which are used by all
                                 * other steps
                                 */
                                (data) =>
                                    !['prompt', 'chat', 'edit'].includes(
                                        data.step
                                    )
                            )
                            .map((data) =>
                                format(`- %step% - %price% USD`, {
                                    step: data.step.padEnd(20, ' '),
                                    price: data.costs.totalPrice.toFixed(3),
                                })
                            )
                            .join('\n'),
                        warning,
                    }
                ),
            })
        );
    }

    if (opts.performance) {
        const perf = opts.result.performance;

        const perfEntries = Object.entries(perf.durationByStep)
            .map(([step, data]) => ({
                step,
                duration: data.duration,
            }))
            .filter((data) => data.step !== 'total' && data.step !== 'unknown');

        const orderedDurations = orderBy(perfEntries, ['duration'], ['desc']);

        console.log(
            await glowFormat({
                input: format(
                    markdown`
                        # Performance

                        Duration: %totalDuration%

                        %durationByStep%
                    `,
                    {
                        totalDuration:
                            (perf.totalDuration / 1000).toFixed(3) + ' sec',

                        measuredDuration:
                            (perf.durationByStep.total.duration / 1000).toFixed(
                                3
                            ) + ' sec',

                        durationByStep: orderedDurations
                            .filter(
                                /**
                                 * Exclude low level steps which are used by all
                                 * other steps
                                 */
                                (data) =>
                                    !['prompt', 'chat', 'edit'].includes(
                                        data.step
                                    )
                            )
                            .map((data) =>
                                format(`- %step% - %duration%`, {
                                    step: data.step.padEnd(20, ' '),
                                    duration:
                                        (data.duration / 1000).toFixed(3) +
                                        ' sec',
                                })
                            )
                            .join('\n'),
                    }
                ),
            })
        );
    }
};

export async function runRefactor(opts: {
    id?: string;
    name?: string;
    saveToCache?: boolean;
    enableCacheFor?: string[];
    costs?: boolean;
    performance?: boolean;
    //
}) {
    try {
        const configs = await loadRefactorConfigs();

        const { config } = await determineConfig({
            ...opts,
            configs,
        });

        const result = await refactor({
            config,
            saveToCache: opts.saveToCache,
            enableCacheFor: opts.enableCacheFor,
        });

        if (result.status === 'failure') {
            await unhandledErrorReport({
                error: result.error,
            });
        }

        if (result.successBranch) {
            console.log(await currentRepositoryRefactoringReport(result));
        } else {
            if (result.planFilesResults[0]?.plannedFiles.length === 0) {
                console.log(
                    await currentRepositoryPlanningEmptyReasonReport(result)
                );
            } else if (Object.keys(result.discarded).length > 0) {
                console.log(
                    await currentRepositoryFailedRefactoringReport(result)
                );
            }
        }
        await analyticsReport({
            result,
            costs: opts.costs ?? true,
            performance: opts.performance ?? true,
        });
    } catch (error) {
        if (error instanceof ConfigurationError) {
            await configurationErrorReport({
                error,
            });
        } else if (error instanceof Error) {
            await unhandledErrorReport({
                error,
            });
        } else {
            throw error;
        }
    }
}

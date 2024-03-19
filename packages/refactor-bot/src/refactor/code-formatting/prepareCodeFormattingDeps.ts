import { z } from 'zod';

import type { CacheStateRef } from '../../cache/types';
import { autoFixIssuesContents } from '../../eslint/autoFixIssues';
import { findRefactorBotPackageRoot } from '../../file-system/findRefactorBotPackageRoot';
import { logger } from '../../logger/logger';
import {
    findPrettierScriptLocation,
    prettierTypescript,
} from '../../prettier/prettier';
import { line } from '../../text/line';

export type CodeFormattingDeps = Awaited<
    ReturnType<typeof prepareCodeFormattingDeps>
> & {
    readonly _brand?: 'CodeFormattingDeps';
};

export const formatDependenciesSchema = z
    .function(z.tuple([]))
    .returns(z.custom<CodeFormattingDeps>());

export async function prepareCodeFormattingDeps(config: {
    location: string;
    scripts?: {
        args: [string, ...string[]];
    }[];
}) {
    let prettierScriptLocation = await findPrettierScriptLocation({
        location: config.location,
    });

    if (!prettierScriptLocation) {
        prettierScriptLocation = await findPrettierScriptLocation({
            location: findRefactorBotPackageRoot(),
        });

        if (!prettierScriptLocation) {
            throw new Error(line`
                Cannot find prettier script location, this might mean the
                dependencies are not installed
            `);
        }

        logger.warn(line`
            Cannot find prettier script location in the sandbox repository
            root "${config.location}" - this means that we might
            use a different version of prettier than the one used in the
            sandbox repository. This can lead to unexpected formatting
            changes. To fix this, please add prettier to the repository
            dependencies before using the refactor-bot.
        `);
    }

    const eslintAutoFixScriptArgs = config.scripts?.find((script) =>
        script.args.includes('eslint')
    )?.args;

    if (!eslintAutoFixScriptArgs) {
        logger.warn(`Eslint auto fix is disabled because eslint is not found`);
    }

    return {
        format: async (
            params: {
                code: string;
                filePath: string;
                throwOnParseError: boolean;
            },
            ctx?: CacheStateRef | undefined
        ) => {
            const prettifiedContent = await prettierTypescript({
                ts: params.code,
                filePath: params.filePath,
                prettierScriptLocation,
                repositoryRoot: config.location,
                throwOnParseError: true,
            });

            const eslintFixed = eslintAutoFixScriptArgs
                ? (
                      await autoFixIssuesContents(
                          {
                              eslintScriptArgs: eslintAutoFixScriptArgs,
                              fileContents: prettifiedContent,
                              filePath: params.filePath,
                              location: config.location,
                          },
                          ctx
                      )
                  ).contents
                : prettifiedContent;

            if (
                eslintFixed === params.code &&
                prettifiedContent !== params.code
            ) {
                throw new Error(
                    line`
                        eslint reverted the code changes as they do not
                        pass the eslint formatting rules. Please do not
                        make similar changes in the future to avoid cycles
                    `
                );
            }

            return eslintFixed;
        },
    };
}

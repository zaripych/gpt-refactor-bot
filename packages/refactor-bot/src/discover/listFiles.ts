import { z } from 'zod';

import { spawnResult } from '../child-process/spawnResult';
import { makeFunction } from '../functions/makeFunction';
import type { FunctionsConfig } from '../functions/types';
import { line } from '../text/line';

const max = 1_000;

const command = [
    `git`,
    `ls-files`,
    `--others`,
    `--cached`,
    `--modified`,
    `--exclude-standard`,
    `--deduplicate`,
    `--`,
] as const;

const directoryStructureArgsSchema = z.object({
    patterns: z.array(z.string()).optional().describe(line`
        Glob patterns for directories and files to look at. When not
        specified - will lookup for all files and directories at the root of
        the repository. To list all files at the root of the repository
        only, use the pattern "*" (without quotes). To list all files with
        name "file.ts" in all directories, use the pattern "**/file.ts"
        (without quotes). To list contents of a directory named "dir" use
        the pattern "dir/*" (without quotes).
    `),
    max: z.number().optional().default(max).describe(line`
        Maximum number of files and directories to return to the caller.
        Defaults to ${max}.
    `),
});

export const listFiles = async (
    input: z.output<typeof directoryStructureArgsSchema>,
    config: FunctionsConfig
) => {
    const { max, patterns } = input;

    const result = await spawnResult(
        command[0],
        [...command.slice(1), ...(patterns || []).map((p) => `:(glob)${p}`)],
        {
            exitCodes: [0],
            cwd: config.repositoryRoot,
        }
    );

    const files = result.stdout.trim().split('\n');

    return {
        filePaths: files.slice(0, max),
        totalFound: files.length,
    };
};

export const listFilesFunction = makeFunction({
    name: 'listFiles',
    argsSchema: directoryStructureArgsSchema,
    resultSchema: z.object({
        filePaths: z.array(z.string()).describe(line`
            List of files, limited to max lines
        `),
        totalFound: z.number().describe(line`
            Total number of files found
        `),
    }),
    implementation: listFiles,
    description: line`
        Scans the repository for files. The number of files returned is limited
        by a parameter. Contents of the .git/ directory along with other files
        matching .gitignore-listed patterns are not included. 
    `,
});

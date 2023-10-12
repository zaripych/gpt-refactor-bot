import assert from 'assert';
import { realpath } from 'fs/promises';
import { basename, isAbsolute, normalize, relative, sep } from 'path';

import { logger } from '../logger/logger';
import { escapeRegExp } from '../utils/escapeRegExp';
import { ensureHasOneElement } from '../utils/hasOne';
import { UnreachableError } from '../utils/UnreachableError';
import { runPackageManagerScript } from './runPackageManagerScript';

type Issue = {
    command: string;
    issue: string;
    filePath: string;
    code?: string;
};

export function eslintUnixOutputParser(output: string) {
    return output
        .trim()
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith(sep))
        .filter(Boolean)
        .map((issue) => {
            const [, filePath] = issue.match(/([^:]+):\d+:\d+:/) || [];
            assert(filePath);

            const [, code] =
                issue.match(/\[(?:warning|error)\/([^\]]+)\]/i) || [];

            return {
                command: 'eslint',
                filePath,
                issue,
                code,
            };
        });
}

export function tscNonPrettyOutputParser(output: string) {
    const fileRegex = /^([^)(\n]+)\(\d+,\d+\):/gm;
    const allIssueStarters = [...output.matchAll(fileRegex)];
    const issues = allIssueStarters.flatMap((match, i) => {
        if (typeof match.index !== 'number') {
            return [];
        }

        const issue = output
            .substring(
                match.index,
                i < allIssueStarters.length - 1
                    ? allIssueStarters[i + 1]?.index
                    : undefined
            )
            .trim();

        const filePath = match[1];

        assert(filePath);

        const [, code] = issue.match(/\s(TS\d+):\s/) || [];

        return [
            {
                command: 'tsc',
                filePath,
                issue,
                code,
            },
        ];
    });

    return issues;
}

export function jestJsonStdoutParser(stdout: string) {
    try {
        const data = JSON.parse(
            stdout
                .replaceAll(/No tests found, exiting with code 0/gm, '')
                .replaceAll(/\s+Task took \d+\.\d+s/gm, '')
        ) as {
            success: boolean;
            numFailedTests: number;
            numTotalTests: number;
            wasInterrupted: boolean;
            testResults: {
                status: 'passed' | 'failed';
                name: string;
                message: string;
                assertionResults: {
                    status: 'passed' | 'failed';
                    title: string;
                    fullName: string;
                    failureMessages: string[];
                    failureDetails: object[];
                    location: string | null;
                };
            }[];
        };

        return data.testResults
            .filter((result) => result.status === 'failed')
            .map((result) => ({
                command: 'jest',
                issue: result.message,
                filePath: result.name,
            }));
    } catch (err) {
        logger.error('Failed to parse jest output', err);
        throw new Error('Failed to parse jest output', { cause: err });
    }
}

export async function runCheckCommandWithParser(opts: {
    packageManager: 'npm' | 'yarn' | 'pnpm';
    script: {
        args: [string, ...string[]];
        parse: 'stdout' | 'stderr';
        supportsFileFiltering: boolean;
    };
    outputParser: (output: string) => Issue[];
    location: string;
}) {
    const { stdout, stderr } = await runPackageManagerScript({
        packageManager: opts.packageManager,
        script: opts.script.args[0],
        args: opts.script.args.slice(1),
        location: opts.location,
        logOnError: undefined,
    });

    const chooseOutput = () => {
        switch (opts.script.parse) {
            case 'stderr':
                return stderr;
            case 'stdout':
                return stdout;
            default:
                throw new UnreachableError(opts.script.parse);
        }
    };

    const parentDirectoryRegex = new RegExp(
        `^.*${escapeRegExp(sep + normalize(basename(opts.location) + sep))}`,
        'g'
    );

    const realLocation = await realpath(opts.location).catch(
        () => opts.location
    );

    return opts.outputParser(chooseOutput()).map((data) => {
        const issue = data.issue.replaceAll(parentDirectoryRegex, '');
        return {
            ...data,
            issue,
            filePath: isAbsolute(data.filePath)
                ? relative(realLocation, data.filePath)
                : data.filePath,
        };
    });
}

export async function runCheckCommand(opts: {
    packageManager: 'npm' | 'yarn' | 'pnpm';
    script: {
        args: [string, ...string[]];
    };
    filePaths?: string[];
    outputParser?: (output: string) => Issue[];
    location: string;
}) {
    const script = {
        ...opts.script,
        args: ensureHasOneElement(opts.script.args.concat([])),
    };

    let parser: ((output: string) => Issue[]) | undefined = undefined;

    switch (script.args[0]) {
        case 'eslint':
            parser = eslintUnixOutputParser;
            script.args.push('--format', 'unix', ...(opts.filePaths || ['.']));
            break;

        case 'tsc':
            parser = tscNonPrettyOutputParser;
            script.args.push('--pretty', 'false');
            break;

        case 'jest':
            parser = jestJsonStdoutParser;
            script.args.push('--no-color', '--json', '--passWithNoTests');
            if (opts.filePaths) {
                script.args.push('--findRelatedTests', ...opts.filePaths);
            }
            break;

        default:
            throw new Error(
                `Command ${script.args[0]} is not supported, expecting ` +
                    `one of: eslint, tsc, jest`
            );
    }

    return runCheckCommandWithParser({
        ...opts,
        script: {
            ...script,
            parse: 'stdout',
            supportsFileFiltering: script.args[0] !== 'tsc',
        },
        outputParser: parser,
    });
}

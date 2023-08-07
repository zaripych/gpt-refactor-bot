import { basename, normalize, sep } from 'path';

import { logger } from '../logger/logger';
import { escapeRegExp } from '../utils/escapeRegExp';
import { ensureHasOneElement } from '../utils/hasOne';
import { UnreachableError } from '../utils/UnreachableError';
import { runPackageManagerScript } from './runPackageManagerScript';

export function eslintUnixOutputParser(output: string) {
    return output
        .trim()
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith(sep))
        .filter(Boolean);
}

export function tscNonPrettyOutputParser(output: string) {
    return output
        .trim()
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
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
            .map((result) => result.message);
    } catch (err) {
        logger.error('Failed to parse jest output', err, stdout);
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
    outputParser: (output: string) => string[];
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

    return opts
        .outputParser(chooseOutput())
        .map((data) => data.replaceAll(parentDirectoryRegex, './'));
}

export async function runCheckCommand(opts: {
    packageManager: 'npm' | 'yarn' | 'pnpm';
    script: {
        args: [string, ...string[]];
        parse: 'stdout' | 'stderr';
        supportsFileFiltering: boolean;
    };
    filePaths?: string[];
    outputParser?: (output: string) => string[];
    location: string;
}) {
    const script = {
        ...opts.script,
        args: ensureHasOneElement(opts.script.args.concat([])),
    };

    let parser: ((output: string) => string[]) | undefined = undefined;

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
            parser = opts.outputParser;
            if (!parser) {
                throw new Error('Cannot determine parser for script');
            }
            if (script.supportsFileFiltering && opts.filePaths) {
                script.args.push(...opts.filePaths);
            }
    }

    return runCheckCommandWithParser({
        ...opts,
        script,
        outputParser: parser,
    });
}

import { gitFilesDiff } from './gitFilesDiff';
import { gitShowFile } from './gitShowFile';

export async function gitShowFileCommitSummary(opts: {
    location: string;
    filePath: string;
    ref: string;
}) {
    return await gitShowFileCommitRangeSummary({
        ...opts,
        from: `${opts.ref}~1`,
        to: opts.ref,
    });
}

export async function gitShowFileCommitRangeSummary(opts: {
    location: string;
    filePath: string;
    from: string;
    to: string;
}) {
    const { location, filePath, from, to } = opts;
    return {
        filePath,
        fileContentsBefore: await gitShowFile({
            location,
            filePath,
            ref: from,
        }),
        fileContentsAfter: await gitShowFile({
            location,
            filePath,
            ref: to,
        }),
        fileDiff: await gitFilesDiff({
            location,
            filePaths: [filePath],
            ref: `${from}...${to}`,
        }),
    };
}

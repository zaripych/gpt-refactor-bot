export function formatFileDiff(opts: {
    filePath: string;
    fileDiff?: string;
    headline?: string;
}) {
    const headline =
        opts.headline ??
        `All your combined changes to the file at \`${opts.filePath}\` so far have produced the following diff:`;

    return opts.fileDiff
        ? `${headline}

\`\`\`diff
${opts.fileDiff}
\`\`\``
        : '';
}

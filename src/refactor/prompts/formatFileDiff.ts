export function formatFileDiff(opts: { fileDiff?: string }) {
    return opts.fileDiff
        ? `The changes have produced the following diff so far:
\`\`\`diff
${opts.fileDiff}
\`\`\``
        : '';
}

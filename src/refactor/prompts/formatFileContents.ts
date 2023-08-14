export function formatFileContents(opts: {
    filePath: string;
    fileContents: string;
    language: string;
}) {
    return `Given the contents of the file: \`${opts.filePath}\`:

\`\`\`${opts.language}
${opts.fileContents}
\`\`\``;
}

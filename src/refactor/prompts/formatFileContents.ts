export function formatFileContents(opts: {
    filePath: string;
    fileContents: string;
    language: string;
    headline?: string;
}) {
    const headline =
        opts.headline ??
        `Here are the current contents of the file at \`${opts.filePath}\`:`;

    return `${headline}

\`\`\`${opts.language}
${opts.fileContents}
\`\`\``;
}

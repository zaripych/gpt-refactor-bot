export function formatIssues(opts: { issues: string[]; description?: string }) {
    const description = `The following issues were found after linting and testing of your changes:`;
    return opts.issues.length > 0
        ? `${description}

${opts.issues.map((issue, index) => `${index + 1}. ${issue}`).join('\n')}`
        : '';
}

export function firstLineOf(text: string, trimSuffix?: string) {
    const firstLine = text.match(/.*$/gm)?.[0] || text;
    return firstLine !== text ? [firstLine, trimSuffix].join('') : firstLine;
}

export function firstLineOf(text: string) {
    return text.match(/.*$/gm)?.[0] || text;
}

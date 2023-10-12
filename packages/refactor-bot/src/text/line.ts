import { format } from 'node:util';

export function replaceNewlinesWithSpaces(text: string): string {
    return text.replaceAll(/[ \t]*[\n]+[ \t]*/g, ' ').trim();
}

export function line(template: string, ...values: unknown[]): string;
export function line(
    template: TemplateStringsArray,
    ...values: unknown[]
): string;
export function line(
    template: string | TemplateStringsArray,
    ...values: unknown[]
) {
    if (typeof template === 'string') {
        if (values.length === 0) {
            return replaceNewlinesWithSpaces(template);
        }
        return replaceNewlinesWithSpaces(format(template, ...values));
    }
    return replaceNewlinesWithSpaces(String.raw({ raw: template }, ...values));
}

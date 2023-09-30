import dedent from 'dedent';
import { format as formatText } from 'util';

import { glowFormat } from './glowFormat';
import { glowPrint } from './glowPrint';

export function markdown(template: string, ...values: unknown[]): string;
export function markdown(
    template: TemplateStringsArray,
    ...values: unknown[]
): string;
export function markdown(
    template: TemplateStringsArray | string,
    ...values: unknown[]
): string {
    if (typeof template === 'string') {
        return formatText(dedent(template), ...values);
    }
    return formatText(
        dedent(
            template
                .map((str, i) => {
                    if (i < values.length) {
                        return str + '%s';
                    } else {
                        return str;
                    }
                })
                .join('')
        ),
        ...values
    );
}

export async function formatMarkdown(input: string, deps = { glowFormat }) {
    return deps.glowFormat({
        input: input
            .replace(/^\s*/g, '')
            .replace(/^\n/g, '')
            .replace(/\n$/g, '')
            .trim(),
    });
}

export async function printMarkdown(input: string, deps = { glowPrint }) {
    await deps.glowPrint({
        input: input
            .replace(/^\s*/g, '')
            .replace(/^\n/g, '')
            .replace(/\n$/g, '')
            .trim(),
    });
}

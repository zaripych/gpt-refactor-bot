import { glowFormat } from './glowFormat';
import { glowPrint } from './glowPrint';

export function markdown(template: TemplateStringsArray, ...values: unknown[]) {
    return String.raw({ raw: template }, ...values);
}

export async function format(input: string, deps = { glowFormat }) {
    return deps.glowFormat({
        input: input
            .replace(/^\s*/g, '')
            .replace(/^\n/g, '')
            .replace(/\n$/g, '')
            .trim(),
    });
}

export async function print(input: string, deps = { glowPrint }) {
    await deps.glowPrint({
        input: input
            .replace(/^\s*/g, '')
            .replace(/^\n/g, '')
            .replace(/\n$/g, '')
            .trim(),
    });
}

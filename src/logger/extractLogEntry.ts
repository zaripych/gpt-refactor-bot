import { format } from 'util';

import { hasOneElement } from '../utils/hasOne';

export function extractLogEntry(
    logLevel: string,
    params: [string, ...unknown[]]
) {
    const { text, formattedText, formatArgs, errors } = params.reduce<{
        text: string[];
        formattedText: string[];
        formatArgs: unknown[];
        errors: Error[];
    }>(
        (acc, param) => {
            if (param === '') {
                return acc;
            }
            if (param instanceof Error) {
                acc.errors.push(param);
            } else if (typeof param === 'string') {
                acc.text.push(param);
                acc.formattedText.push(param);
            } else {
                acc.formattedText.push('%o');
                acc.formatArgs.push(param);
            }
            return acc;
        },
        {
            text: [],
            formattedText: [],
            formatArgs: [],
            errors: [],
        }
    );
    if (errors.length > 0) {
        return {
            level: logLevel,
            message: formattedText.join(' '),
            data: hasOneElement(errors)
                ? {
                      ...errors[0],
                      stack: errors[0].stack,
                  }
                : errors.map((err) => ({
                      ...err,
                      stack: err.stack,
                  })),
        };
    } else if (formatArgs.length === 0) {
        return {
            level: logLevel,
            message: params.join(' '),
        };
    } else if (hasOneElement(formatArgs)) {
        return {
            level: logLevel,
            message: text.join(' '),
            data: formatArgs[0] as object,
        };
    } else {
        return {
            level: logLevel,
            message: format(formattedText.join(' '), ...formatArgs),
        };
    }
}

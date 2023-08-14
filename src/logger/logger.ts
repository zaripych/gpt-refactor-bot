import type { BaseLogger } from 'pino';
import { pino } from 'pino';

const pinoLogger = pino(
    {
        level: process.env['LOG_LEVEL'] ?? 'info',
        customLevels: {
            log: 30,
        },
    },
    process.stdout
);

export const logger = pinoLogger as Pick<
    typeof pinoLogger,
    keyof BaseLogger | 'log'
>;

import { declareAction } from '../../event-bus';

export const executionStarted = declareAction(
    'executionStarted',
    (data: { name: string; key: string; input: unknown }) => ({
        ...data,
        status: 'started' as const,
    })
);

export const executionSuccess = declareAction(
    'executionSuccess',
    (data: { name: string; key: string; cached: boolean }) => ({
        ...data,
        status: 'success' as const,
    })
);

export const executionFailed = declareAction(
    'executionFailed',
    (data: { name: string; key: string; error: unknown }) => ({
        ...data,
        status: 'failed' as const,
    })
);

export const executionTiming = declareAction(
    'executionTiming',
    (data: {
        name: string;
        key: string;
        timestamp: number;
        duration: number;
    }) => ({
        ...data,
    })
);

import assert from 'node:assert';

import type express from 'express';
import { z, ZodError } from 'zod';

import type { ApiExport } from './loadApi';

function errorInfo(
    err: unknown,
    opts?: {
        includeStack?: boolean;
    }
) {
    const error =
        err instanceof Error
            ? err
            : new Error(String(err), {
                  cause: err,
              });

    const includeStack = opts?.includeStack ?? true;

    return {
        name: error.name,
        message: error.message,
        ...(includeStack && {
            stack: error.stack,
        }),
    };
}

export function errorResponse(
    err: unknown,
    opts?: {
        includeStack?: boolean;
    }
) {
    return {
        error: errorInfo(err, opts),
    };
}

export async function handleApiRequest(
    api: ApiExport,
    req: express.Request<{ method: string }>,
    res: express.Response
) {
    try {
        if (typeof req.params.method !== 'string') {
            res.status(400).send(
                errorResponse(new Error('Method not provided'))
            );
            return;
        }

        const fn = api[req.params.method];
        if (!fn) {
            res.status(404).send(errorResponse(new Error('Method not found')));
            return;
        }

        if (typeof req.body !== 'object' || !req.body) {
            res.status(400).send(
                errorResponse(new Error('Body is not an object'))
            );
            return;
        }

        const params = z
            .object({
                data: z.unknown(),
            })
            .strict()
            .safeParse(req.body);

        if (!params.success) {
            res.status(400).send(
                errorResponse(params.error, {
                    includeStack: false,
                })
            );
            return;
        }

        assert(
            typeof fn === 'function',
            `Method "${req.params.method}" is not a function`
        );

        try {
            const response = await fn(params.data.data);

            res.status(200).send({
                response,
            });
        } catch (err) {
            if (err instanceof ZodError) {
                res.status(400).send(errorResponse(err));
                return;
            } else {
                res.status(500).send(errorResponse(err));
            }
        }
    } catch (err) {
        res.status(500).send(errorResponse(err));
    }
}

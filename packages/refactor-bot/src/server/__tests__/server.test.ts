import { expect, it } from '@jest/globals';
import { randomBytes } from 'crypto';
import { fileURLToPath } from 'url';

import { randomText } from '../../utils/randomText';
import { randomUnixSocketPath } from '../randomUnixSocketPath';
import { RpcError } from '../rpcError';
import { startRpc } from '../startRpc';
import { startServerInCurrentProcess } from '../startServerInCurrentProcess';
import { makeHttpRequest } from './makeHttpRequest';
import { testApi } from './testApi';

it('should allow using asApi method', async () => {
    const unixSocketPath = randomUnixSocketPath();
    const apiModulePath = fileURLToPath(
        new URL('./testApi.ts', import.meta.url)
    );
    const apiExportName = 'testApi';

    const { teardown, asApi } = await startRpc({
        apiModulePath,
        apiExportName,
        unixSocketPath,
        startServerProcess: startServerInCurrentProcess,
    });

    const api = asApi<typeof testApi>(Object.keys(testApi));

    try {
        expect(await api.echo('test')).toBe('test');
        expect(await api.ping()).toBe('pong');
        await expect(api.throwRegularError()).rejects.toThrowError(
            'Regular error'
        );
        await expect(api.throwNonError()).rejects.toThrowError('Non-error');
    } finally {
        teardown();
    }
});

it('should get the data', async () => {
    const unixSocketPath = randomUnixSocketPath();
    const apiModulePath = fileURLToPath(
        new URL('./testApi.ts', import.meta.url)
    );
    const apiExportName = 'testApi';

    const { makeRequest, teardown } = await startRpc({
        apiModulePath,
        apiExportName,
        unixSocketPath,
        startServerProcess: startServerInCurrentProcess,
    });
    try {
        expect(
            await makeRequest({
                method: 'ping',
            })
        ).toBe('pong');
    } finally {
        teardown();
    }
});

it('should send and get the data', async () => {
    const unixSocketPath = randomUnixSocketPath();
    const apiModulePath = fileURLToPath(
        new URL('./testApi.ts', import.meta.url)
    );
    const apiExportName = 'testApi';

    const { makeRequest, teardown } = await startRpc({
        apiModulePath,
        apiExportName,
        unixSocketPath,
        startServerProcess: startServerInCurrentProcess,
    });

    try {
        expect(
            await makeRequest({
                method: 'echo',
                data: 'test',
            })
        ).toBe('test');
    } finally {
        teardown();
    }
});

it('should send and get data larger than default watermark', async () => {
    const unixSocketPath = randomUnixSocketPath();
    const apiModulePath = fileURLToPath(
        new URL('./testApi.ts', import.meta.url)
    );
    const apiExportName = 'testApi';

    const { makeRequest, teardown } = await startRpc({
        apiModulePath,
        apiExportName,
        unixSocketPath,
        startServerProcess: startServerInCurrentProcess,
    });

    const DEFAULT_HIGH_WATER_MARK = 16_000;

    try {
        const data = randomBytes(DEFAULT_HIGH_WATER_MARK * 2).toString('hex');

        expect(
            await makeRequest({
                method: 'echo',
                data,
            })
        ).toBe(data);
    } finally {
        teardown();
    }
});

it('should be able to make multiple requests at the same time', async () => {
    const unixSocketPath = randomUnixSocketPath();
    const apiModulePath = fileURLToPath(
        new URL('./testApi.ts', import.meta.url)
    );
    const apiExportName = 'testApi';

    const { makeRequest, teardown } = await startRpc({
        apiModulePath,
        apiExportName,
        unixSocketPath,
        startServerProcess: startServerInCurrentProcess,
    });

    try {
        const data1 = randomBytes(1024).toString('hex');
        const data2 = randomBytes(1024).toString('hex');
        expect(
            await Promise.all([
                makeRequest({
                    method: 'echo',
                    data: data1,
                }),
                makeRequest({
                    method: 'echo',
                    data: data2,
                }),
            ])
        ).toEqual([data1, data2]);
    } finally {
        teardown();
    }
});

it('should be able to propagate errors as RpcError', async () => {
    const unixSocketPath = randomUnixSocketPath();
    const apiModulePath = fileURLToPath(
        new URL('./testApi.ts', import.meta.url)
    );
    const apiExportName = 'testApi';

    const { makeRequest, teardown } = await startRpc({
        apiModulePath,
        apiExportName,
        unixSocketPath,
        startServerProcess: startServerInCurrentProcess,
    });

    try {
        const regularErrorResponse = makeRequest({
            method: 'throwRegularError',
        });
        await expect(regularErrorResponse).rejects.toThrowError(RpcError);
        await expect(regularErrorResponse).rejects.toThrowError(
            'Regular error'
        );

        const nonErrorResponse = makeRequest({
            method: 'throwNonError',
        });
        await expect(nonErrorResponse).rejects.toThrowError(RpcError);
        await expect(nonErrorResponse).rejects.toThrowError('Non-error');
    } finally {
        teardown();
    }
});

it('should NOT be able to respond after teardown', async () => {
    const unixSocketPath = randomUnixSocketPath();
    const apiModulePath = fileURLToPath(
        new URL('./testApi.ts', import.meta.url)
    );
    const apiExportName = 'testApi';

    const { makeRequest, teardown } = await startRpc({
        apiModulePath,
        apiExportName,
        unixSocketPath,
        startServerProcess: startServerInCurrentProcess,
    });

    teardown();

    const cannotConnectError = makeRequest({
        method: 'throwRegularError',
    });
    await expect(cannotConnectError).rejects.toThrowError(
        'Server is not listening, did you teardown?'
    );
});

it('should be able to make multiple requests at the same time in a separate process', async () => {
    const unixSocketPath = randomUnixSocketPath();
    const apiModulePath = fileURLToPath(
        new URL('./testApi.ts', import.meta.url)
    );
    const apiExportName = 'testApi';

    const { makeRequest, teardown } = await startRpc({
        apiModulePath,
        apiExportName,
        unixSocketPath,
    });

    try {
        const data1 = randomBytes(1024).toString('hex');
        const data2 = randomBytes(1024).toString('hex');
        expect(
            await Promise.all([
                makeRequest({
                    method: 'echo',
                    data: data1,
                }),
                makeRequest({
                    method: 'echo',
                    data: data2,
                }),
            ])
        ).toEqual([data1, data2]);
    } finally {
        teardown();
    }
});

it('should NOT be able to respond after teardown in a separate process', async () => {
    const unixSocketPath = randomUnixSocketPath();
    const apiModulePath = fileURLToPath(
        new URL('./testApi.ts', import.meta.url)
    );
    const apiExportName = 'testApi';

    const { makeRequest, teardown } = await startRpc({
        apiModulePath,
        apiExportName,
        unixSocketPath,
    });

    teardown();

    const cannotConnectError = makeRequest({
        method: 'throwRegularError',
    });
    await expect(cannotConnectError).rejects.toThrowError(
        /Server process has crashed with "SIGTERM" signal|Server is not listening, did you teardown/
    );
});

it('should be able to propagate errors as RpcError in a separate process', async () => {
    const unixSocketPath = randomUnixSocketPath();
    const apiModulePath = fileURLToPath(
        new URL('./testApi.ts', import.meta.url)
    );
    const apiExportName = 'testApi';

    const { makeRequest, teardown } = await startRpc({
        apiModulePath,
        apiExportName,
        unixSocketPath,
    });

    try {
        const regularErrorResponse = makeRequest({
            method: 'throwRegularError',
        });
        await expect(regularErrorResponse).rejects.toThrowError(RpcError);
        await expect(regularErrorResponse).rejects.toThrowError(
            'Regular error'
        );

        const nonErrorResponse = makeRequest({
            method: 'throwNonError',
        });
        await expect(nonErrorResponse).rejects.toThrowError(RpcError);
        await expect(nonErrorResponse).rejects.toThrowError('Non-error');
    } finally {
        teardown();
    }
});

it('should 401 when requested without auth', async () => {
    const unixSocketPath = randomUnixSocketPath();
    const apiModulePath = fileURLToPath(
        new URL('./testApi.ts', import.meta.url)
    );
    const apiExportName = 'testApi';

    const { teardown } = await startRpc({
        apiModulePath,
        apiExportName,
        unixSocketPath,
        startServerProcess: startServerInCurrentProcess,
    });
    try {
        await expect(
            makeHttpRequest({
                method: 'POST',
                path: `/api/ping`,
                unixSocketPath,
            })
        ).resolves.toEqual(
            expect.objectContaining({
                statusCode: 401,
            })
        );
    } finally {
        teardown();
    }
});

it('should 404 when requested with invalid HTTP method', async () => {
    const unixSocketPath = randomUnixSocketPath();
    const apiModulePath = fileURLToPath(
        new URL('./testApi.ts', import.meta.url)
    );
    const apiExportName = 'testApi';

    const apiPasskey = randomText(8);

    const { teardown } = await startRpc({
        apiModulePath,
        apiExportName,
        unixSocketPath,
        apiPasskey,
        startServerProcess: startServerInCurrentProcess,
    });
    try {
        await expect(
            makeHttpRequest({
                method: 'GET',
                path: `/api/ping`,
                unixSocketPath,
                headers: {
                    authorization: `Bearer ${apiPasskey}`,
                },
            })
        ).resolves.toEqual(
            expect.objectContaining({
                statusCode: 404,
            })
        );
    } finally {
        teardown();
    }
});

it('should 404 when requested with invalid HTTP path', async () => {
    const unixSocketPath = randomUnixSocketPath();
    const apiModulePath = fileURLToPath(
        new URL('./testApi.ts', import.meta.url)
    );
    const apiExportName = 'testApi';

    const apiPasskey = randomText(8);

    const { teardown } = await startRpc({
        apiModulePath,
        apiExportName,
        unixSocketPath,
        apiPasskey,
        startServerProcess: startServerInCurrentProcess,
    });
    try {
        await expect(
            makeHttpRequest({
                method: 'POST',
                path: `/api/xxx`,
                unixSocketPath,
                headers: {
                    authorization: `Bearer ${apiPasskey}`,
                },
            })
        ).resolves.toEqual(
            expect.objectContaining({
                statusCode: 404,
            })
        );
    } finally {
        teardown();
    }
});

it('should 400 when requested with invalid body', async () => {
    const unixSocketPath = randomUnixSocketPath();
    const apiModulePath = fileURLToPath(
        new URL('./testApi.ts', import.meta.url)
    );
    const apiExportName = 'testApi';

    const apiPasskey = randomText(8);

    const { teardown } = await startRpc({
        apiModulePath,
        apiExportName,
        unixSocketPath,
        apiPasskey,
        startServerProcess: startServerInCurrentProcess,
    });
    try {
        await expect(
            makeHttpRequest({
                method: 'POST',
                path: `/api/ping`,
                unixSocketPath,
                headers: {
                    authorization: `Bearer ${apiPasskey}`,
                    [`content-type`]: `application/json`,
                },
                body: JSON.stringify({ body: 'invalid' }),
            })
        ).resolves.toEqual(
            expect.objectContaining({
                statusCode: 400,
            })
        );
    } finally {
        teardown();
    }
});

it('should 200 when requested with valid body', async () => {
    const unixSocketPath = randomUnixSocketPath();
    const apiModulePath = fileURLToPath(
        new URL('./testApi.ts', import.meta.url)
    );
    const apiExportName = 'testApi';

    const apiPasskey = randomText(8);

    const { teardown } = await startRpc({
        apiModulePath,
        apiExportName,
        unixSocketPath,
        apiPasskey,
        startServerProcess: startServerInCurrentProcess,
    });
    try {
        await expect(
            makeHttpRequest({
                method: 'POST',
                path: `/api/ping`,
                unixSocketPath,
                headers: {
                    authorization: `Bearer ${apiPasskey}`,
                    [`content-type`]: `application/json`,
                },
                body: JSON.stringify({ data: 'valid' }),
            })
        ).resolves.toEqual(
            expect.objectContaining({
                statusCode: 200,
            })
        );
    } finally {
        teardown();
    }
});

import { randomText } from '../utils/randomText';
import type { ApiExport, PromisifiedApi } from './loadApi';
import { makeApiRequest } from './makeApiRequest';
import { randomUnixSocketPath } from './randomUnixSocketPath';
import { startServerInSeparateProcess } from './startNodeProcess';
import { startServerInCurrentProcess } from './startServerInCurrentProcess';

export async function startRpc(opts: {
    /**
     * Api module is a module that has a named export which serves as a
     * rpc call handler. The name of the export is passed as `apiExportName`
     * option. The exported object must have one or more functions defined
     * which receive single parameter and return single value. The functions
     * can be asynchronous as well as synchronous.
     */
    apiModulePath: string;
    apiExportName: string;
    unixSocketPath?: string;
    apiPasskey?: string;
    startServerProcess?: (opts: {
        unixSocketPath: string;
        apiModulePath: string;
        apiExportName: string;
        apiPasskey: string;
    }) => Promise<{
        teardown: () => void;
        checkStatus?: () => void;
    }>;
}) {
    const {
        apiModulePath,
        apiExportName,
        unixSocketPath = randomUnixSocketPath(),
    } = opts;

    const apiPasskey = opts.apiPasskey ?? randomText(8);

    const defaultStart: typeof opts.startServerProcess = process.env[
        'WALLABY_TESTS'
    ]
        ? startServerInCurrentProcess
        : startServerInSeparateProcess;

    const startProcess = opts.startServerProcess ?? defaultStart;

    const { teardown, checkStatus } = await startProcess({
        unixSocketPath,
        apiModulePath,
        apiExportName,
        apiPasskey,
    });

    const makeRequestWithRetries = async (opts: {
        method: string;
        data?: unknown;
    }) => {
        const MAX_ATTEMPTS = 3;

        let attempts = 0;
        // eslint-disable-next-line no-constant-condition
        while (true) {
            try {
                if (checkStatus) {
                    checkStatus();
                }

                return await makeApiRequest({
                    unixSocketPath,
                    method: opts.method,
                    data: opts.data,
                    apiPasskey,
                });
            } catch (err) {
                if (checkStatus) {
                    checkStatus();
                }

                attempts += 1;

                if (attempts > MAX_ATTEMPTS) {
                    throw err;
                }

                if (
                    typeof err === 'object' &&
                    err &&
                    'code' in err &&
                    err.code === 'ENOENT'
                ) {
                    await new Promise((res) => {
                        setTimeout(
                            res,
                            300 + Math.min(Math.pow(2, attempts) * 100, 3000)
                        );
                    });
                } else {
                    throw err;
                }
            }
        }
    };

    return {
        asApi: <T extends ApiExport>(methodNames: string[]) => {
            const api: Partial<PromisifiedApi<T>> = {};
            for (const method of methodNames) {
                if (typeof method !== 'string') {
                    continue;
                }

                api[method as keyof T] = (async (data?: unknown) => {
                    return await makeRequestWithRetries({
                        method,
                        data,
                    });
                }) as PromisifiedApi<T>[keyof T];
            }
            return {
                ...(api as PromisifiedApi<T>),
                teardown,
            };
        },
        makeRequest: makeRequestWithRetries,
        teardown: () => {
            teardown();
        },
    };
}

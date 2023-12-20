type ApiFn = {
    hack(arg?: unknown): unknown;
}['hack'];

/**
 * Just a record with async functions receiving a single parameter and
 * returning a single object value, parameters and responses must be
 * serializable to JSON.
 */
export type ApiExport = Record<string, ApiFn>;

export type PromisifiedApi<T> = {
    [K in keyof T]: T[K] extends ApiFn
        ? Parameters<T[K]>[0] extends void
            ? () => Promise<ReturnType<T[K]>>
            : (arg: Parameters<T[K]>[0]) => Promise<ReturnType<T[K]>>
        : never;
};

export async function loadApi(opts: {
    apiModulePath: string;
    apiExportName: string;
}) {
    const { apiModulePath, apiExportName } = opts;

    const { [apiExportName]: apiExport } = (await import(apiModulePath)) as {
        [key: string]: ApiExport;
    };

    if (!apiExport) {
        throw new Error(
            `No export with name "${apiExportName}" found in "${apiModulePath}"`
        );
    }
    if (typeof apiExport !== 'object') {
        throw new Error(`Export with name "${apiExportName}" is not an object`);
    }

    return apiExport;
}

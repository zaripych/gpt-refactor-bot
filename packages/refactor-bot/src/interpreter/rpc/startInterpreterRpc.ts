import { fileURLToPath } from 'url';

import { startRpc } from '../../server';
import { interpreterRpc } from './interpreterRpc';

export const startInterpreterRpc = async () => {
    const { asApi, output } = await startRpc({
        apiModulePath: fileURLToPath(
            new URL('./interpreterRpc', import.meta.url)
        ),
        apiExportName: 'interpreterRpc',
    });

    return {
        ...asApi<typeof interpreterRpc>(Object.keys(interpreterRpc)),
        output,
    };
};

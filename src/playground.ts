import { executeFunction } from './functions/executeFunction';

await executeFunction({
    name: 'typeDeclaration' as const,
    arguments: {
        identifier: 'executeFunction',
        initialFilePath: 'src/playground.ts',
    },
});

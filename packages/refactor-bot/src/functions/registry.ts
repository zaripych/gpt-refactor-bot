import { z } from 'zod';

import { listFilesFunction } from '../discover/listFiles';
import { readFileFunction } from '../discover/readFile';
import { searchFunction } from '../discover/search';
import { runTsMorphScriptFunction } from '../interpreter/runTsMorphScript';
import { declarationsFunction } from '../ts-morph/declarations';
import { moduleImportsFunction } from '../ts-morph/moduleImports';
import { quickInfoFunction } from '../ts-morph/quickInfo';
import { referencesFunction } from '../ts-morph/references';
import { ensureHasOneElement } from '../utils/hasOne';

export const functions = [
    referencesFunction,
    moduleImportsFunction,
    quickInfoFunction,
    declarationsFunction,
    listFilesFunction,
    searchFunction,
    readFileFunction,
    runTsMorphScriptFunction,
];

export const functionNames = ensureHasOneElement(functions.map((f) => f.name));

export const functionNamesSchema: z.ZodEnum<typeof functionNames> =
    z.enum(functionNames);

export const allowedFunctionsSchema = z
    .array(functionNamesSchema)
    .default([
        'references',
        'moduleImports',
        'declarations',
        'listFiles',
        'search',
    ]);

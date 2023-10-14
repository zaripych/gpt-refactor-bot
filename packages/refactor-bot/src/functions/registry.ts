import { listFilesFunction } from '../discover/listFiles';
import { readFileFunction } from '../discover/readFile';
import { searchFunction } from '../discover/search';
import { declarationsFunction } from '../ts-morph/declarations';
import { moduleImportsFunction } from '../ts-morph/moduleImports';
import { quickInfoFunction } from '../ts-morph/quickInfo';
import { referencesFunction } from '../ts-morph/references';

export const functions = [
    referencesFunction,
    moduleImportsFunction,
    quickInfoFunction,
    declarationsFunction,
    listFilesFunction,
    searchFunction,
    readFileFunction,
];

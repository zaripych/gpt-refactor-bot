import { moduleImportsFunction } from '../ts-morph/moduleImports';
import { referencesFunction } from '../ts-morph/references';
// import { typeDeclarationFunction } from '../ts-morph/typeDeclaration';

export const functions = [
    referencesFunction,
    moduleImportsFunction,
    /**
     * @todo this function is not yet tested
     */
    //typeDeclarationFunction,
];

import { type Project } from 'ts-morph';

import type { FunctionsConfig } from '../../functions/makeFunction';
import { findIdentifier } from './findIdentifier';
import type { Args } from './types';

export function findReferences(
    project: Project,
    config: FunctionsConfig,
    args: Args
) {
    const node = findIdentifier(project, config, args);

    const referencedSymbols = project.getLanguageService().findReferences(node);

    return referencedSymbols;
}

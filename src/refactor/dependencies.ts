import { findRepositoryRoot } from '../file-system/findRepositoryRoot';
import { includeFunctions } from '../functions/includeFunctions';
import { logger } from '../logger/logger';

export const makeDependencies = () => {
    return {
        logger,
        includeFunctions,
        findRepositoryRoot,
    };
};

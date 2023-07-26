import { findRepositoryRoot } from '../file-system/findRepositoryRoot';
import { logger } from '../logger/logger';

export const makeDependencies = () => {
    return {
        logger,
        findRepositoryRoot,
    };
};

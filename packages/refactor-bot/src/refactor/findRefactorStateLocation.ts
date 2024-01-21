import { globby } from 'globby';
import { basename, dirname } from 'path';

import { ConfigurationError } from '../errors/configurationError';
import { findRepositoryRoot } from '../file-system/findRepositoryRoot';
import { hasOneElement } from '../utils/hasOne';

/**
 * Finds the location of the state files for a given refactor id, the state
 * files will store temporary information about the refactor, cached data and
 * other information that is not needed to be stored in the git repository.
 */
export async function findRefactorStateLocation(opts: {
    id: string;
    location?: string;
}) {
    if (!opts.id) {
        throw new Error('id is required');
    }

    const repoRoot = await findRepositoryRoot(opts.location);

    const location = await globby(
        `.refactor-bot/refactors/*/state/${opts.id}/`,
        {
            cwd: repoRoot,
            onlyDirectories: true,
        }
    );

    if (!hasOneElement(location)) {
        throw new ConfigurationError(
            `Cannot find files to load state from for id "${opts.id}"`
        );
    }

    const name = basename(dirname(dirname(location[0])));

    return {
        id: opts.id,
        name,
        location: location[0],
    };
}

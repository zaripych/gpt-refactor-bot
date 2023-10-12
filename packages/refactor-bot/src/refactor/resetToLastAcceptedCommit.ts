import orderBy from 'lodash-es/orderBy';

import { gitResetHard } from '../git/gitResetHard';
import { gitRevParse } from '../git/gitRevParse';
import { logger } from '../logger/logger';
import { hasOneElement } from '../utils/hasOne';
import type { RefactorFilesResult } from './types';

export async function resetToLastAcceptedCommit(opts: {
    location: string;
    result: RefactorFilesResult;
}) {
    const accepted = orderBy(
        Object.entries(opts.result.accepted).flatMap(([_, entry]) =>
            entry.filter((file) => file.lastCommit).map((file) => file)
        ),
        ['timestamp'],
        ['desc']
    );

    if (!hasOneElement(accepted)) {
        /**
         * @note early return
         */
        return;
    }

    const currentCommit = await gitRevParse({
        location: opts.location,
        ref: 'HEAD',
    });
    const lastCommit = accepted[0].lastCommit;

    if (lastCommit && lastCommit !== currentCommit) {
        logger.info(`Resetting to last successful commit ${lastCommit}`);

        await gitResetHard({
            location: opts.location,
            ref: lastCommit,
        });
    }
}

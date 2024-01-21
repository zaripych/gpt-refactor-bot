import type { z } from 'zod';

import { declareAction } from '../../event-bus';
import type { refactorFileResultSchema } from '../types';

/**
 * When result of a file edit is accepted, an accepted edit will
 * be applied to the file system and committed so we can build next
 * edit on top of it
 */
export const acceptedEdit = declareAction(
    'acceptedEdit',
    (result: z.infer<typeof refactorFileResultSchema>) => result
);

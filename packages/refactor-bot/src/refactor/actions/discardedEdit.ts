import type { z } from 'zod';

import { declareAction } from '../../event-bus';
import type { refactorFileResultSchema } from '../types';

/**
 * When result of a file edit is discarded
 */
export const discardedEdit = declareAction(
    'discardedEdit',
    (result: z.infer<typeof refactorFileResultSchema>) => result
);

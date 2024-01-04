import type { z } from 'zod';

import { declareAction } from '../../event-bus';
import type { refactorResultSchema } from '../types';

/**
 * When result of a file edit is discarded
 */
export const discardedEdit = declareAction(
    'discardedEdit',
    (result: z.infer<typeof refactorResultSchema>) => result
);

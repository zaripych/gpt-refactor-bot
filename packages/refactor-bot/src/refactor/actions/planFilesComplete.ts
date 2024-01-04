import type { z } from 'zod';

import { declareAction } from '../../event-bus';
import type { planFilesResultSchema } from '../planFiles';

export const planFilesComplete = declareAction(
    'planFilesComplete',
    (data: z.infer<typeof planFilesResultSchema>) => data
);

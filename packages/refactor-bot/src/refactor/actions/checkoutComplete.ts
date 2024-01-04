import type { z } from 'zod';

import { declareAction } from '../../event-bus';
import type { checkoutSandboxResultSchema } from '../checkoutSandbox';

/**
 * When sandbox is initialized and ready to be used
 */
export const checkoutComplete = declareAction(
    'checkoutComplete',
    (data: z.infer<typeof checkoutSandboxResultSchema>) => data
);

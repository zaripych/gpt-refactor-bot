import { Subject } from 'rxjs';

import type { AnyAction } from './action';

export const actions = new Subject<AnyAction>();

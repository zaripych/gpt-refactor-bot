import type { AnyAction } from './action';
import { actions } from './bus';

export function dispatch(action: AnyAction) {
    actions.next(action);
}

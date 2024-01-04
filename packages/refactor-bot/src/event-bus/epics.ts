import type { ObservedValueOf } from 'rxjs';
import { merge, type Observable } from 'rxjs';

import type { AnyAction } from './action';
import { dispatch } from './dispatch';
import { actions } from './listen';

export type AnyEpic = (input: Observable<AnyAction>) => Observable<AnyAction>;

/**
 * Epics to control side effects
 */
export type Epic<I extends AnyAction, O extends AnyAction> = (
    input: Observable<I>
) => Observable<O>;

/**
 * Runs the epic until it is teared down
 *
 * @param epic Epic to run
 * @returns Subscription, unsubscribe it to tear down the epic
 */
export function runEpic<E extends AnyEpic>(
    epic: E,
    deps = {
        actions,
        dispatch,
    }
) {
    return deps
        .actions()
        .pipe((actions) => epic(actions))
        .subscribe({
            next: (action) => deps.dispatch(action),
        });
}

export type InputActionOfEpic<E extends AnyEpic> = ObservedValueOf<
    Parameters<E>[0]
>;

export type OutputActionOfEpic<E extends AnyEpic> = ObservedValueOf<
    ReturnType<E>
>;

export function mergeEpics<E extends AnyEpic[]>(epics: E) {
    return (input: Observable<InputActionOfEpic<E[number]>>) =>
        merge(
            ...epics.map(
                (epic) =>
                    epic(input) as Observable<OutputActionOfEpic<E[number]>>
            )
        );
}

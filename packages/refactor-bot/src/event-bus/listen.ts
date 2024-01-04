import { actions as actionsSubject } from './bus';

export function actions() {
    return actionsSubject.asObservable();
}

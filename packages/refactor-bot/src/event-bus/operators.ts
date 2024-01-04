import { filter, type Observable } from 'rxjs';

import type { ActionOfCreator, AnyAction, AnyActionCreator } from './action';

export function ofTypes<Types extends AnyActionCreator[]>(...types: Types) {
    return (stream: Observable<AnyAction>) => {
        return stream.pipe(
            filter((action) => types.some((t) => t.type === action.type))
        ) as Observable<ActionOfCreator<Types[number]>>;
    };
}

import { type AnyActionCreator, declareAction } from '../action';

export const exampleAction = declareAction('exampleAction');

export const exampleAction1 = declareAction(
    'exampleAction1',
    (data: string) => data
);

export const exampleActionCreator: AnyActionCreator = exampleAction;
export const exampleActionCreator1: AnyActionCreator = exampleAction1;

/* eslint-disable @typescript-eslint/no-explicit-any */

import { z } from 'zod';

export type AnyAction = Action<any, void> | Action<any, unknown>;

export type AnyActionCreator =
    | {
          type: any;
          (): Action<any, any>;
      }
    | {
          type: any;
          (param: any): Action<any, any>;
      };

export type Action<T, P> = P extends void
    ? {
          type: T;
      }
    : {
          type: T;
          data: P;
      };

export type ActionCreator<T, P> = P extends void
    ? {
          type: T;
          (): Action<T, void>;
      }
    : {
          type: T;
          (data: P): Action<T, P>;
      };

export type ActionCreatorWithSchema<T, Schema extends z.ZodType<unknown>> = {
    type: T;
    schema: z.ZodObject<
        {
            type: z.ZodLiteral<T>;
            data: Schema;
        },
        'passthrough' | 'strict' | 'strip',
        z.ZodTypeAny,
        {
            type: T;
            data: z.output<Schema>;
        }
    >;
    (data: z.input<Schema>): Action<T, z.output<Schema>>;
};

export type TypeOfAction<T> = T extends Action<infer U, unknown>
    ? U
    : T extends ActionCreator<infer U, unknown>
      ? U
      : never;

export type ActionOfCreator<T> = T extends AnyActionCreator
    ? ReturnType<T>
    : never;

/**
 * Declares an action by creating action creator function.
 *
 * Action creator can then be used to create action instances
 * which can be dispatched to the event bus and listened to.
 *
 * This specific overload creates an action without payload.
 */
export function declareAction<const T>(type: T): {
    type: T;
    (): Action<T, void>;
};
/**
 * Declares an action by creating action creator function.
 *
 * Action creator can then be used to create action instances
 * which can be dispatched to the event bus and listened to.
 *
 * This specific overload creates an action with payload.
 */
export function declareAction<const T, P, D>(
    type: T,
    creator: (param: P) => D
): {
    type: T;
    (data: P): Action<T, D>;
};
export function declareAction<const T>(
    type: T,
    creator?: (param?: unknown) => unknown
): AnyActionCreator {
    return Object.assign(
        (param?: unknown) => ({
            type,
            ...(creator && { data: creator(param) }),
        }),
        {
            type,
        }
    );
}

export function declareActionWithSchema<
    const T extends z.Primitive,
    Schema extends z.ZodType,
>(
    type: T,
    schema: Schema
): {
    type: T;
    schema: z.ZodObject<{
        type: z.ZodLiteral<T>;
        data: Schema;
    }>;
    (data: z.input<Schema>): Action<T, z.output<Schema>>;
};
export function declareActionWithSchema<const T extends z.Primitive, P>(
    type: T,
    schema: z.ZodType<P>
): AnyActionCreator {
    return Object.assign(
        (param?: unknown) => ({
            type,
            data: schema.parse(param),
        }),
        {
            type,
            schema: z.object({
                type: z.literal(type),
                data: schema,
            }),
        }
    );
}

export function isOfType<T extends AnyActionCreator>(
    action: AnyAction,
    creator: T
): action is ActionOfCreator<T> {
    return action.type === creator.type;
}

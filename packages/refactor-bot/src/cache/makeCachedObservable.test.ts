import { expect, it, jest } from '@jest/globals';
import mm from 'micromatch';
import { relative } from 'path';
import type { Observable } from 'rxjs';
import { lastValueFrom, of, Subject, switchMap } from 'rxjs';
import { z } from 'zod';

import { CycleDetectedError } from '../errors/cycleDetectedError';
import { type AnyAction, declareActionWithSchema } from '../event-bus';
import { ofTypes } from '../event-bus/operators';
import { line } from '../text/line';
import { ancestorDirectories } from '../utils/ancestorDirectories';
import { looselyTypedMock } from '../utils/createMock';
import type { cleanCache } from './cache';
import { cleanCache as cleanCacheToTest } from './cache';
import { defaultDeps } from './dependencies';
import { makeCachedObservable as makeCachedObservableToTest } from './makeCachedObservable';
import { getPipelineState, initializeCacheState } from './state';

const setup = () => {
    const files = new Map<string, unknown>();

    const subject = new Subject<AnyAction>();
    const actions = jest.fn(() => subject.asObservable());
    const dispatch = jest.fn((action: AnyAction) => subject.next(action));

    const deps = looselyTypedMock<typeof defaultDeps>({
        ...defaultDeps,
        logger: {
            debug: jest.fn(),
            log: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            trace: jest.fn(),
            silly: jest.fn(),
            fatal: jest.fn(),
        },
        dumpYaml: jest.fn((value) => value),
        loadYaml: jest.fn((value) => value),
        mkdir: jest.fn(),
        readFile: jest.fn((path: string) => {
            if (!files.has(path)) {
                throw Object.assign(new Error(`File ${path} does not exist`), {
                    code: 'ENOENT',
                });
            }
            return files.get(path);
        }),
        writeFile: jest.fn((path: string, value) => files.set(path, value)),
        fg: jest.fn(
            (
                patterns: string[],
                opts: { cwd: string; ignore: string[]; onlyFiles?: boolean }
            ) => {
                const result = [];
                for (const [key] of files) {
                    const relativeKeyPath = relative(opts.cwd, key);
                    if (mm.isMatch(relativeKeyPath, patterns, opts)) {
                        result.push(relativeKeyPath);
                    }
                }
                if (opts.onlyFiles === false) {
                    const dirs = new Set(
                        [...files.entries()].flatMap(([key]) => {
                            return ancestorDirectories(relative(opts.cwd, key));
                        })
                    );
                    for (const dir of dirs) {
                        if (mm.isMatch(dir, patterns, opts)) {
                            result.push(dir);
                        }
                    }
                }
                return Promise.resolve(result);
            }
        ),
        rm: jest.fn((path: string) => {
            const keys = [...files.keys()];
            for (const key of keys) {
                if (key.startsWith(path)) {
                    files.delete(key);
                }
            }
        }),
        unlink: jest.fn((path: string) => {
            files.delete(path);
        }),
        rename: jest.fn(),
        hash: jest.fn(defaultDeps.hash),
        dispatch,
        actions,
        defaultSaveInput: false,
    });
    expect(deps.dumpYaml.mock.calls).toBeTruthy();

    return {
        deps,
        files,
        makeCachedObservable: ((...params) => {
            params[1] = deps;
            return makeCachedObservableToTest(...params);
        }) satisfies typeof makeCachedObservableToTest,
        cleanCache: ((...params) => {
            params[2] = deps;
            return cleanCacheToTest(...params);
        }) satisfies typeof cleanCache,
    };
};

const addResult = declareActionWithSchema(
    'addResult',
    z.object({ value: z.number() })
);

const multiplyResult = declareActionWithSchema(
    'multiplyResult',
    z.object({ value: z.number() })
);

const resultFrom = async (stream: Observable<AnyAction>) => {
    const result = await lastValueFrom(
        stream.pipe(ofTypes(addResult, multiplyResult))
    );
    return result;
};

it(
    line`
        should not persist, when without cache location and has one observable
    `,
    async () => {
        const { files, makeCachedObservable } = setup();

        const add = jest.fn(({ value }: { value: number }) =>
            of(addResult({ value: value + 1 }))
        );

        const addWithCache = makeCachedObservable({
            factory: add,
            name: 'add',
            inputSchema: z.object({ value: z.number() }),
            eventSchema: [addResult.schema],
        });

        expect(addWithCache.name).toBe('add');

        const ctxNoLocation = {};

        /**
         * @note saving cache to disk is disabled by not specifying the location
         */
        expect(
            await resultFrom(addWithCache({ value: 0 }, ctxNoLocation))
        ).toEqual(addResult({ value: 1 }));

        expect(add).toHaveBeenCalledWith(
            { value: 0 },
            expect.not.objectContaining({ location: expect.anything() })
        );

        expect(Object.fromEntries(files.entries())).toEqual({});
        expect(getPipelineState(ctxNoLocation)?.log).toEqual(['add-660e']);
        expect(
            getPipelineState(ctxNoLocation)?.events.get('add-660e')
        ).toContainEqual(addResult({ value: 1 }));
    }
);

it(
    line`
        should persist, when with location and has one cached observable
    `,
    async () => {
        const { files, makeCachedObservable } = setup();

        const add = jest.fn(({ value }: { value: number }) =>
            of(addResult({ value: value + 1 }))
        );

        const addWithCache = makeCachedObservable({
            factory: add,
            name: 'add',
            inputSchema: z.object({ value: z.number() }),
            eventSchema: [addResult.schema],
        });

        const ctxHasLocation = {
            location: '.',
        };

        expect(
            await resultFrom(addWithCache({ value: 0 }, ctxHasLocation))
        ).toEqual(addResult({ value: 1 }));

        expect(add).toHaveBeenCalledWith(
            { value: 0 },
            expect.objectContaining({ location: 'add-660e' })
        );

        expect(Object.fromEntries(files.entries())).toEqual({
            'add-660e.yaml': expect.arrayContaining([addResult({ value: 1 })]),
        });
    }
);

it(
    line`
        should not persist, when without location and has one observable and it
        is run multiple times
    `,
    async () => {
        const { files, makeCachedObservable } = setup();

        const add = jest.fn(({ value }: { value: number }) =>
            of(addResult({ value: value + 1 }))
        );

        const addWithCache = makeCachedObservable({
            factory: add,
            name: 'add',
            inputSchema: z.object({ value: z.number() }),
            eventSchema: [addResult.schema],
        });

        const ctxNoLocation = {};

        expect(
            await resultFrom(addWithCache({ value: 0 }, ctxNoLocation))
        ).toEqual(
            addResult({
                value: 1,
            })
        );
        expect(
            await resultFrom(addWithCache({ value: 1 }, ctxNoLocation))
        ).toEqual(
            addResult({
                value: 2,
            })
        );
        expect(
            await resultFrom(addWithCache({ value: 2 }, ctxNoLocation))
        ).toEqual(
            addResult({
                value: 3,
            })
        );

        expect(add).toHaveBeenCalledWith(
            { value: 0 },
            expect.not.objectContaining({ location: expect.anything() })
        );
        expect(add).toHaveBeenCalledWith(
            { value: 1 },
            expect.not.objectContaining({ location: expect.anything() })
        );
        expect(add).toHaveBeenCalledWith(
            { value: 2 },
            expect.not.objectContaining({ location: expect.anything() })
        );

        expect(getPipelineState(ctxNoLocation)?.log).toEqual([
            'add-660e',
            'add-993e',
            'add-10bb',
        ]);
        expect(Object.fromEntries(files.entries())).toEqual({});
    }
);

it(
    line`
        should detect cycle - when called multiple times with exactly same
        input, given non-deterministic function
    `,
    async () => {
        const { makeCachedObservable } = setup();

        const add = jest.fn(({ value }: { value: number }) =>
            of(addResult({ value: value + 1 }))
        );

        const addWithCache = makeCachedObservable({
            factory: add,
            name: 'add',
            inputSchema: z.object({ value: z.number() }),
            eventSchema: [addResult.schema],
            /**
             * @note type defaults to non-deterministic
             */
            // type: 'non-deterministic',
        });

        const ctxHasLocation = { location: '.' };

        expect(
            await resultFrom(addWithCache({ value: 1 }, ctxHasLocation))
        ).toEqual(
            expect.objectContaining({
                data: { value: expect.any(Number) },
            })
        );

        await expect(
            resultFrom(addWithCache({ value: 1 }, ctxHasLocation))
        ).rejects.toMatchObject({
            key: 'add-993e',
        });

        await expect(
            resultFrom(addWithCache({ value: 1 }, ctxHasLocation))
        ).rejects.toBeInstanceOf(CycleDetectedError);

        expect(add).toHaveBeenCalledTimes(1);

        expect(getPipelineState(ctxHasLocation)?.log).toEqual(['add-993e']);
    }
);

it(
    line`
        should allow cycle - when called multiple times with exactly same input
        given deterministic function
    `,
    async () => {
        const { makeCachedObservable } = setup();

        const add = jest.fn(({ value }: { value: number }) =>
            of(addResult({ value: value + 1 }))
        );

        const addWithCache = makeCachedObservable({
            factory: add,
            name: 'add',
            inputSchema: z.object({ value: z.number() }),
            eventSchema: [addResult.schema],
            /**
             * @note type defaults to non-deterministic
             */
            type: 'deterministic',
        });

        const ctxHasLocation = { location: '.' };

        expect(
            await resultFrom(addWithCache({ value: 1 }, ctxHasLocation))
        ).toEqual(
            expect.objectContaining({
                data: { value: expect.any(Number) },
            })
        );
        expect(
            await resultFrom(addWithCache({ value: 1 }, ctxHasLocation))
        ).toEqual(
            expect.objectContaining({
                data: { value: expect.any(Number) },
            })
        );
        expect(
            await resultFrom(addWithCache({ value: 1 }, ctxHasLocation))
        ).toEqual(
            expect.objectContaining({
                data: { value: expect.any(Number) },
            })
        );

        /**
         * @note deterministic functions will have the same hash
         */
        expect(add).toHaveBeenCalledTimes(1);

        expect(getPipelineState(ctxHasLocation)?.log).toEqual([
            'add-993e',
            'add-993e',
            'add-993e',
        ]);
    }
);

it(
    line`
        should not persist - when without location and two cached observables
    `,
    async () => {
        const { files, makeCachedObservable } = setup();

        const add = jest.fn(({ value }: { value: number }) =>
            of(addResult({ value: value + 1 }))
        );

        const multiply = jest.fn(({ value }: { value: number }) =>
            of(multiplyResult({ value: value * 2 }))
        );

        const addWithCache = makeCachedObservable({
            factory: add,
            name: 'add',
            inputSchema: z.object({ value: z.number() }),
            eventSchema: [addResult.schema],
        });

        const multiplyWithCache = makeCachedObservable({
            factory: multiply,
            name: 'multiply',
            inputSchema: z.object({ value: z.number() }),
            eventSchema: [multiplyResult.schema],
        });

        const ctxNoLocation = {};

        const combined = async (
            input: z.input<typeof addWithCache.inputSchema>
        ) => {
            const addResult = await resultFrom(
                addWithCache(input, ctxNoLocation)
            );
            const multiplyResult = await resultFrom(
                multiplyWithCache(
                    {
                        value: addResult.data.value,
                    },
                    ctxNoLocation
                )
            );
            return multiplyResult.data;
        };

        expect(await combined({ value: 0 })).toEqual({ value: 2 });

        expect(add).toHaveBeenCalledWith(
            { value: 0 },
            expect.not.objectContaining({ location: expect.anything() })
        );
        expect(multiply).toHaveBeenCalledWith(
            { value: 1 },
            expect.not.objectContaining({ location: expect.anything() })
        );

        expect(Object.fromEntries(files.entries())).toEqual({});
    }
);

it(
    line`
        should persist - when without location and has two cached observables
        and called multiple times
    `,
    async () => {
        const { files, makeCachedObservable } = setup();

        const add = jest.fn(({ value }: { value: number }) =>
            of(addResult({ value: value + 1 }))
        );

        const multiply = jest.fn(({ value }: { value: number }) =>
            of(multiplyResult({ value: value * 2 }))
        );

        const addWithCache = makeCachedObservable({
            factory: add,
            name: 'add',
            inputSchema: z.object({ value: z.number() }),
            eventSchema: [addResult.schema],
        });

        const multiplyWithCache = makeCachedObservable({
            factory: multiply,
            name: 'multiply',
            inputSchema: z.object({ value: z.number() }),
            eventSchema: [multiplyResult.schema],
        });

        const ctxNoLocation = {};

        const combined = async (
            input: z.input<typeof addWithCache.inputSchema>
        ) => {
            const addResult = await resultFrom(
                addWithCache(input, ctxNoLocation)
            );
            const multiplyResult = await resultFrom(
                multiplyWithCache(
                    {
                        value: addResult.data.value,
                    },
                    ctxNoLocation
                )
            );
            return multiplyResult.data;
        };

        expect(await combined({ value: 0 })).toEqual({ value: 2 });
        expect(await combined({ value: 2 })).toEqual({ value: 6 });
        expect(await combined({ value: 6 })).toEqual({ value: 14 });

        expect(add).toHaveBeenCalledWith(
            { value: 0 },
            expect.not.objectContaining({ location: expect.anything() })
        );
        expect(add).toHaveBeenCalledWith(
            { value: 2 },
            expect.not.objectContaining({ location: expect.anything() })
        );
        expect(add).toHaveBeenCalledWith(
            { value: 6 },
            expect.not.objectContaining({ location: expect.anything() })
        );

        expect(Object.fromEntries(files.entries())).toEqual({});
    }
);

it(
    line`
        should persist - with location and two cached observables and called
        multiple times
    `,
    async () => {
        const { files, makeCachedObservable } = setup();

        const add = jest.fn(({ value }: { value: number }) =>
            of(addResult({ value: value + 1 }))
        );

        const multiply = jest.fn(({ value }: { value: number }) =>
            of(multiplyResult({ value: value * 2 }))
        );

        const addWithCache = makeCachedObservable({
            factory: add,
            name: 'add',
            inputSchema: z.object({ value: z.number() }),
            eventSchema: [addResult.schema],
        });

        const multiplyWithCache = makeCachedObservable({
            factory: multiply,
            name: 'multiply',
            inputSchema: z.object({ value: z.number() }),
            eventSchema: [multiplyResult.schema],
        });

        const ctxHasLocation = {
            location: '.',
        };

        const combined = async (
            input: z.input<typeof addWithCache.inputSchema>
        ) => {
            const addResult = await resultFrom(
                addWithCache(input, ctxHasLocation)
            );
            const multiplyResult = await resultFrom(
                multiplyWithCache(
                    {
                        value: addResult.data.value,
                    },
                    ctxHasLocation
                )
            );
            return multiplyResult.data;
        };

        expect(await combined({ value: 0 })).toEqual({ value: 2 });
        expect(await combined({ value: 2 })).toEqual({ value: 6 });
        expect(await combined({ value: 6 })).toEqual({ value: 14 });

        expect(add).toHaveBeenCalledWith(
            { value: 0 },
            expect.objectContaining({ location: expect.anything() })
        );
        expect(add).toHaveBeenCalledWith(
            { value: 2 },
            expect.objectContaining({ location: expect.anything() })
        );
        expect(add).toHaveBeenCalledWith(
            { value: 6 },
            expect.objectContaining({ location: expect.anything() })
        );

        expect(Object.fromEntries(files.entries())).toEqual({
            'add-660e.yaml': expect.arrayContaining([addResult({ value: 1 })]),
            'multiply-993e.yaml': expect.arrayContaining([
                multiplyResult({ value: 2 }),
            ]),
            'add-10bb.yaml': expect.arrayContaining([addResult({ value: 3 })]),
            'multiply-7441.yaml': expect.arrayContaining([
                multiplyResult({ value: 6 }),
            ]),
            'add-8092.yaml': expect.arrayContaining([addResult({ value: 7 })]),
            'multiply-c76d.yaml': expect.arrayContaining([
                multiplyResult({ value: 14 }),
            ]),
        });
    }
);

it(
    line`
        should use cache - when has one observable cached
    `,
    async () => {
        const { files, makeCachedObservable } = setup();

        Object.entries({
            'add-660e.yaml': [addResult({ value: 1 })],
        }).forEach(([key, value]) => files.set(key, value));

        const add = jest.fn(({ value }: { value: number }) =>
            of(addResult({ value: value + 1 }))
        );

        const addWithCache = makeCachedObservable({
            factory: add,
            name: 'add',
            inputSchema: z.object({ value: z.number() }),
            eventSchema: [addResult.schema],
        });

        const ctxHasLocation = { location: '.' };

        expect(
            await resultFrom(addWithCache({ value: 0 }, ctxHasLocation))
        ).toEqual(
            addResult({
                value: 1,
            })
        );

        expect(add).not.toHaveBeenCalledWith();
    }
);

it(
    line`
        should re-evaluate - when has one observable cached and the persisted
        hash doesn't match the new hash
    `,
    async () => {
        const { files, makeCachedObservable } = setup();

        Object.entries({
            'add-660e.yaml': [addResult({ value: 1 })],
        }).forEach(([key, value]) => files.set(key, value));

        const add = jest.fn(({ value }: { value: number }) =>
            of(addResult({ value: value + 1 }))
        );

        const addWithCache = makeCachedObservable({
            factory: add,
            name: 'add',
            inputSchema: z.object({ value: z.number() }),
            eventSchema: [addResult.schema],
        });

        const ctxHasLocation = { location: '.' };

        expect(
            await resultFrom(addWithCache({ value: 2 }, ctxHasLocation))
        ).toEqual(
            addResult({
                value: 3,
            })
        );

        expect(add).toHaveBeenCalledTimes(1);

        expect(Object.fromEntries(files.entries())).toEqual({
            'add-660e.yaml': expect.arrayContaining([addResult({ value: 1 })]),
            'add-10bb.yaml': expect.arrayContaining([addResult({ value: 3 })]),
        });
    }
);

it(
    line`
        should use cache - when has one observable and it is run multiple
        times with different input
    `,
    async () => {
        const { files, makeCachedObservable } = setup();

        Object.entries({
            'add-660e.yaml': [addResult({ value: 1 })],
        }).forEach(([key, value]) => files.set(key, value));

        const add = jest.fn(({ value }: { value: number }) =>
            of(addResult({ value: value + 1 }))
        );

        const addWithCache = makeCachedObservable({
            factory: add,
            name: 'add',
            inputSchema: z.object({ value: z.number() }),
            eventSchema: [addResult.schema],
        });

        const ctxHasLocation = {
            location: '.',
        };

        expect(
            await resultFrom(addWithCache({ value: 0 }, ctxHasLocation))
        ).toEqual(
            addResult({
                value: 1,
            })
        );
        expect(
            await resultFrom(addWithCache({ value: 1 }, ctxHasLocation))
        ).toEqual(
            addResult({
                value: 2,
            })
        );
        expect(
            await resultFrom(addWithCache({ value: 2 }, ctxHasLocation))
        ).toEqual(
            addResult({
                value: 3,
            })
        );
        expect(
            await resultFrom(addWithCache({ value: 3 }, ctxHasLocation))
        ).toEqual(
            addResult({
                value: 4,
            })
        );

        expect(Object.fromEntries(files.entries())).toEqual({
            'add-660e.yaml': expect.arrayContaining([addResult({ value: 1 })]),
            'add-993e.yaml': expect.arrayContaining([addResult({ value: 2 })]),
            'add-10bb.yaml': expect.arrayContaining([addResult({ value: 3 })]),
            'add-7441.yaml': expect.arrayContaining([addResult({ value: 4 })]),
        });

        add.mockClear();

        const differentCtxSameLocation = {
            location: ctxHasLocation.location,
        };

        expect(
            await resultFrom(
                addWithCache({ value: 0 }, differentCtxSameLocation)
            )
        ).toEqual(
            addResult({
                value: 1,
            })
        );
        expect(
            await resultFrom(
                addWithCache({ value: 1 }, differentCtxSameLocation)
            )
        ).toEqual(
            addResult({
                value: 2,
            })
        );
        expect(
            await resultFrom(
                addWithCache({ value: 2 }, differentCtxSameLocation)
            )
        ).toEqual(
            addResult({
                value: 3,
            })
        );
        expect(
            await resultFrom(
                addWithCache({ value: 3 }, differentCtxSameLocation)
            )
        ).toEqual(
            addResult({
                value: 4,
            })
        );

        expect(add).not.toHaveBeenCalledWith({ value: 0 }, expect.anything());
        expect(add).not.toHaveBeenCalledWith({ value: 1 }, expect.anything());
        expect(add).not.toHaveBeenCalledWith({ value: 2 }, expect.anything());
        expect(add).not.toHaveBeenCalledWith({ value: 3 }, expect.anything());
    }
);

it(
    line`
        should persist and use cache - when we have multiple observables
        forming a hierarchy
    `,
    async () => {
        const { files, makeCachedObservable } = setup();

        const add = jest.fn(({ value }: { value: number }) =>
            of(addResult({ value: value + 1 }))
        );

        const multiply = jest.fn(({ value }: { value: number }) =>
            of(multiplyResult({ value: value * 2 }))
        );

        const addWithCache = makeCachedObservable({
            factory: add,
            name: 'add',
            inputSchema: z.object({ value: z.number() }),
            eventSchema: [addResult.schema],
        });

        const multiplyWithCache = makeCachedObservable({
            factory: multiply,
            name: 'multiply',
            inputSchema: z.object({ value: z.number() }),
            eventSchema: [multiplyResult.schema],
        });

        const subPipe = makeCachedObservable({
            factory: (input: z.input<typeof addWithCache.inputSchema>, ctx) =>
                addWithCache(input, ctx).pipe(
                    ofTypes(addResult),
                    switchMap((addResult) =>
                        multiplyWithCache(addResult.data, ctx)
                    )
                ),
            name: 'sub-pipe',
            inputSchema: addWithCache.inputSchema,
            eventSchema: [multiplyResult.schema],
        });

        const pipeParent = async (
            input: z.input<typeof subPipe.inputSchema>,
            ctx?: { location?: string }
        ) => {
            const sub = await resultFrom(subPipe(input, ctx));
            return await resultFrom(multiplyWithCache(sub.data, ctx));
        };

        const ctx = { location: '.' };

        expect(await pipeParent({ value: 4 }, ctx)).toEqual(
            multiplyResult({
                value: 20,
            })
        );

        expect(add).toHaveBeenCalled();
        expect(multiply).toHaveBeenCalled();

        expect(Object.fromEntries(files.entries())).toEqual({
            'multiply-26e7.yaml': expect.arrayContaining([
                multiplyResult({ value: 20 }),
            ]),
            'sub-pipe-51ea/add-51ea.yaml': expect.arrayContaining([
                addResult({ value: 5 }),
            ]),
            'sub-pipe-51ea/multiply-b956.yaml': expect.arrayContaining([
                multiplyResult({ value: 10 }),
            ]),
            'sub-pipe-51ea.yaml': expect.arrayContaining([
                multiplyResult({ value: 10 }),
            ]),
        });

        add.mockClear();
        multiply.mockClear();

        expect(
            await pipeParent({ value: 4 }, { location: ctx.location })
        ).toEqual(
            multiplyResult({
                value: 20,
            })
        );

        expect(add).not.toHaveBeenCalled();
        expect(multiply).not.toHaveBeenCalled();
    }
);

it('should delete old cached files when clean is called', async () => {
    const { files, makeCachedObservable, cleanCache } = setup();

    Object.entries({
        'add-660e.yaml': [addResult({ value: 1 })],
    }).forEach(([key, value]) => files.set(key, value));

    const add = jest.fn(({ value }: { value: number }) =>
        of(addResult({ value: value + 1 }))
    );

    const addWithCache = makeCachedObservable({
        factory: add,
        name: 'add',
        inputSchema: z.object({ value: z.number() }),
        eventSchema: [addResult.schema],
    });

    const ctx = {
        location: '.',
    };

    expect(await resultFrom(addWithCache({ value: 2 }, ctx))).toEqual(
        addResult({
            value: 3,
        })
    );

    const addPersistence = {
        location: 'add-10bb',
    };

    expect(add).toHaveBeenCalledWith(
        { value: 2 },
        expect.objectContaining(addPersistence)
    );

    expect(Object.fromEntries(files.entries())).toEqual({
        'add-10bb.yaml': expect.arrayContaining([addResult({ value: 3 })]),
        'add-660e.yaml': expect.arrayContaining([addResult({ value: 1 })]),
    });

    await cleanCache({ cleanRoot: true }, ctx);

    expect(Object.fromEntries(files.entries())).toEqual({
        'add-10bb.yaml': expect.arrayContaining([addResult({ value: 3 })]),
    });
});

it('should clean only on executed levels', async () => {
    const { deps, files, cleanCache } = setup();

    Object.entries({
        'sub-pipe-51ea/add-51ea.yaml': [{ value: 5 }],
        'sub-pipe-51ea/add-xxyy.yaml': [{ value: 5 }],
        'sub-pipe-51ea/multiply-b956.yaml': [{ value: 10 }],
        'sub-pipe-51ea/multiply-xxyy.yaml': [{ value: 5 }],
        'sub-pipe-51ea.yaml': [{ value: 10 }],
        'sub-pipe-xxxx/add-51ea.yaml': [{ value: 5 }],
        'sub-pipe-xxxx/add-xxyy.yaml': [{ value: 5 }],
        'sub-pipe-xxxx/multiply-b956.yaml': [{ value: 10 }],
        'sub-pipe-xxxx/multiply-xxyy.yaml': [{ value: 5 }],
        'sub-pipe-xxxx.yaml': [{ value: 15 }],
        'multiply-26e7.yaml': [{ value: 20 }],
        'multiply-xxxx.yaml': [{ value: 30 }],
    }).forEach(([key, value]) => files.set(key, value));

    const ctx = { location: '.' };

    initializeCacheState(ctx).log.push(
        //
        'sub-pipe-51ea',
        'multiply-26e7'
    );

    await cleanCache({ cleanRoot: true }, ctx, deps);

    /**
     * @note note that files with xxxx hash deleted but not files with xxyy hash
     */
    expect(Object.fromEntries(files.entries())).toEqual({
        'multiply-26e7.yaml': [{ value: 20 }],
        'sub-pipe-51ea.yaml': [{ value: 10 }],
        'sub-pipe-51ea/add-51ea.yaml': [{ value: 5 }],
        'sub-pipe-51ea/add-xxyy.yaml': [{ value: 5 }],
        'sub-pipe-51ea/multiply-b956.yaml': [{ value: 10 }],
        'sub-pipe-51ea/multiply-xxyy.yaml': [{ value: 5 }],
    });

    getPipelineState(ctx)?.log.push(
        'sub-pipe-51ea/add-51ea',
        'sub-pipe-51ea/multiply-b956'
    );

    await cleanCache({ cleanRoot: true }, ctx, deps);

    /**
     * @note note that files with xxyy hash deleted now
     */
    expect(Object.fromEntries(files.entries())).toEqual({
        'sub-pipe-51ea/add-51ea.yaml': [{ value: 5 }],
        'sub-pipe-51ea/multiply-b956.yaml': [{ value: 10 }],
        'sub-pipe-51ea.yaml': [{ value: 10 }],
        'multiply-26e7.yaml': [{ value: 20 }],
    });
});

import { expect, it, jest } from '@jest/globals';
import mm from 'micromatch';
import { relative } from 'path';
import { z } from 'zod';

import { CycleDetectedError } from '../errors/cycleDetectedError';
import { line } from '../text/line';
import { ancestorDirectories } from '../utils/ancestorDirectories';
import { looselyTypedMock } from '../utils/createMock';
import type { cleanCache } from './cache';
import { cleanCache as cleanCacheToTest } from './cache';
import { defaultDeps } from './dependencies';
import { makePipelineFunction as makePipelineFunctionToTest } from './makePipelineFunction';
import { getPipelineState } from './state';

const setup = () => {
    const files = new Map<string, unknown>();

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
        defaultSaveInput: false,
    });
    expect(deps.dumpYaml.mock.calls).toBeTruthy();

    return {
        deps,
        files,
        makePipelineFunction: ((...params) => {
            params[1] = deps;
            return makePipelineFunctionToTest(...params);
        }) satisfies typeof makePipelineFunctionToTest,
        cleanCache: ((...params) => {
            params[1] = deps;
            return cleanCacheToTest(...params);
        }) satisfies typeof cleanCache,
    };
};

it('fg mock is reasonable', async () => {
    const { deps, files } = setup();

    Object.entries({
        'file.yaml': undefined,
        'another.yaml': undefined,
        'different-type.txt': undefined,
        'sub-dir/file.yaml': undefined,
        'sub-dir/sub-dir/sub-file.yaml': undefined,
    }).forEach(([key, value]) => files.set(key, value));

    await expect(
        deps.fg(['*.yaml'], { cwd: '.', ignore: [] })
    ).resolves.toEqual(['file.yaml', 'another.yaml']);

    await expect(deps.fg(['*.txt'], { cwd: '.', ignore: [] })).resolves.toEqual(
        ['different-type.txt']
    );

    await expect(
        deps.fg(['*.yaml'], { cwd: '.', ignore: ['file.yaml'] })
    ).resolves.toEqual(['another.yaml']);

    await expect(
        deps.fg(['*.yaml'], { cwd: 'empty-sub-dir/', ignore: [] })
    ).resolves.toEqual([]);

    await expect(
        deps.fg(['*.yaml'], { cwd: 'sub-dir', ignore: [] })
    ).resolves.toEqual(['file.yaml']);

    await expect(
        deps.fg(['**/*.yaml'], { cwd: 'sub-dir/', ignore: [] })
    ).resolves.toEqual(['file.yaml', 'sub-dir/sub-file.yaml']);

    await expect(
        deps.fg(['**/*.yaml'], { cwd: 'sub-dir', ignore: ['**/sub-*.yaml'] })
    ).resolves.toEqual(['file.yaml']);

    await expect(
        deps.fg(['**/*.yaml'], { cwd: 'sub-dir/', ignore: ['sub-file.yaml'] })
    ).resolves.toEqual(['file.yaml', 'sub-dir/sub-file.yaml']);

    await expect(
        deps.fg(['**/*.yaml'], {
            cwd: 'sub-dir',
            ignore: ['sub-dir/sub-file.yaml'],
        })
    ).resolves.toEqual(['file.yaml']);

    await expect(
        deps.fg(['*'], {
            cwd: '.',
            ignore: [],
            onlyFiles: false,
        })
    ).resolves.toEqual([
        'file.yaml',
        'another.yaml',
        'different-type.txt',
        'sub-dir',
    ]);

    await expect(
        deps.fg(['sub-*'], {
            cwd: '.',
            ignore: [],
            onlyFiles: false,
        })
    ).resolves.toEqual(['sub-dir']);

    await expect(
        deps.fg(['*'], {
            cwd: 'sub-dir',
            ignore: [],
            onlyFiles: false,
        })
    ).resolves.toEqual(['file.yaml', 'sub-dir']);
});

it('should work when has one element without cache location', async () => {
    const { files, makePipelineFunction } = setup();

    const add = jest.fn(({ value }: { value: number }) =>
        Promise.resolve({ value: value + 1 })
    );

    const addWithCache = makePipelineFunction({
        transform: add,
        name: 'add',
        inputSchema: z.object({ value: z.number() }),
        resultSchema: z.object({ value: z.number() }),
    });

    expect(addWithCache.name).toBe('add');

    const stateRef = {};

    /**
     * @note saving cache to disk is disabled by not specifying the location
     */
    expect(await addWithCache({ value: 0 }, stateRef)).toEqual({ value: 1 });

    expect(add).toHaveBeenCalledWith(
        { value: 0 },
        expect.not.objectContaining({ location: expect.anything() })
    );

    expect(Object.fromEntries(files.entries())).toEqual({});
    expect(getPipelineState(stateRef)?.log).toEqual(['add-660e']);
    expect(getPipelineState(stateRef)?.results).toEqual(
        new Map([['add-660e', { value: 1 }]])
    );
});

it('should add Zod defaults before the functions is called', async () => {
    const { files, makePipelineFunction } = setup();

    const add = jest.fn(({ value }: { value: number }) =>
        Promise.resolve({ value: value + 1 })
    );

    const addWithCache = makePipelineFunction({
        transform: add,
        name: 'add',
        inputSchema: z.object({
            value: z.number(),
            default: z.string().default('value'),
        }),
        resultSchema: z.object({ value: z.number() }),
    });

    expect(await addWithCache({ value: 0 })).toEqual({ value: 1 });

    expect(add).toHaveBeenCalledWith(
        {
            value: 0,
            default: 'value',
        },
        expect.not.objectContaining({ location: expect.anything() })
    );

    expect(Object.fromEntries(files.entries())).toEqual({});
});

it('should work when has one element with persistence', async () => {
    const { files, makePipelineFunction } = setup();

    const add = jest.fn(({ value }: { value: number }) =>
        Promise.resolve({ value: value + 1 })
    );

    const addWithCache = makePipelineFunction({
        transform: add,
        name: 'add',
        inputSchema: z.object({ value: z.number() }),
        resultSchema: z.object({ value: z.number() }),
    });

    expect(await addWithCache({ value: 0 }, { location: './' })).toEqual({
        value: 1,
    });

    expect(add).toHaveBeenCalledWith(
        { value: 0 },
        expect.objectContaining({ location: 'add-660e' })
    );

    expect(Object.fromEntries(files.entries())).toEqual({
        'add-660e.yaml': { value: 1 },
    });
});

it('should work when has one element and transform called multiple times', async () => {
    const { files, makePipelineFunction } = setup();

    const add = jest.fn(({ value }: { value: number }) =>
        Promise.resolve({ value: value + 1 })
    );

    const addWithCache = makePipelineFunction({
        transform: add,
        name: 'add',
        inputSchema: z.object({ value: z.number() }),
        resultSchema: z.object({ value: z.number() }),
    });

    expect(await addWithCache({ value: 0 })).toEqual({ value: 1 });
    expect(await addWithCache({ value: 1 })).toEqual({ value: 2 });
    expect(await addWithCache({ value: 2 })).toEqual({ value: 3 });

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

    expect(Object.fromEntries(files.entries())).toEqual({});
});

it(
    line`
        should throw when called multiple times with exactly
        same input for non-deterministic function
    `,
    async () => {
        const { makePipelineFunction } = setup();

        const add = jest.fn((_: { value: number }) =>
            Promise.resolve({ value: Math.random() })
        );

        const addWithCache = makePipelineFunction({
            transform: add,
            name: 'add',
            /**
             * @note type defaults to non-deterministic
             */
            // type: 'non-deterministic',
            inputSchema: z.object({ value: z.number() }),
            resultSchema: z.object({ value: z.number() }),
        });

        const stateRef = { location: '.' };

        expect(await addWithCache({ value: 1 }, stateRef)).toEqual({
            value: expect.any(Number),
        });

        await expect(
            addWithCache({ value: 1 }, stateRef)
        ).rejects.toMatchObject({
            key: 'add-993e',
        });

        await expect(
            addWithCache({ value: 1 }, stateRef)
        ).rejects.toBeInstanceOf(CycleDetectedError);

        expect(add).toHaveBeenCalledTimes(1);

        expect(getPipelineState(stateRef)?.log).toEqual(['add-993e']);
    }
);

it(
    line`
        should work when has one element and called multiple times with
        exactly same input for deterministic function
    `,
    async () => {
        const { makePipelineFunction } = setup();

        const add = jest.fn((_: { value: number }) =>
            Promise.resolve({ value: Math.random() })
        );

        const addWithCache = makePipelineFunction({
            transform: add,
            name: 'add',
            type: 'deterministic',
            inputSchema: z.object({ value: z.number() }),
            resultSchema: z.object({ value: z.number() }),
        });

        const stateRef = { location: '.' };

        expect(await addWithCache({ value: 1 }, stateRef)).toEqual({
            value: expect.any(Number),
        });
        expect(await addWithCache({ value: 1 }, stateRef)).toEqual({
            value: expect.any(Number),
        });
        expect(await addWithCache({ value: 1 }, stateRef)).toEqual({
            value: expect.any(Number),
        });

        /**
         * @note deterministic functions will have the same hash
         */
        expect(add).toHaveBeenCalledTimes(1);

        expect(getPipelineState(stateRef)?.log).toEqual([
            'add-993e',
            'add-993e',
            'add-993e',
        ]);
    }
);

it('should work when has two elements without persistence', async () => {
    const { files, makePipelineFunction } = setup();

    const add = jest.fn(({ value }: { value: number }) =>
        Promise.resolve({ value: value + 1 })
    );

    const multiply = jest.fn(({ value }: { value: number }) =>
        Promise.resolve({ value: value * 2 })
    );

    const addWithCache = makePipelineFunction({
        transform: add,
        name: 'add',
        inputSchema: z.object({ value: z.number() }),
        resultSchema: z.object({ value: z.number() }),
    });

    const multiplyWithCache = makePipelineFunction({
        transform: multiply,
        name: 'multiply',
        inputSchema: z.object({ value: z.number() }),
        resultSchema: z.object({ value: z.number() }),
    });

    const combined = async (
        input: z.input<typeof addWithCache.inputSchema>
    ) => {
        const addResult = await addWithCache(input);
        const multiplyResult = await multiplyWithCache(addResult);
        return multiplyResult;
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
});

it(
    line`
        should work when has two elements and it is called multiple times
    `,
    async () => {
        const { files, makePipelineFunction } = setup();

        const add = jest.fn(({ value }: { value: number }) =>
            Promise.resolve({ value: value + 1 })
        );

        const multiply = jest.fn(({ value }: { value: number }) =>
            Promise.resolve({ value: value * 2 })
        );

        const addWithCache = makePipelineFunction({
            transform: add,
            name: 'add',
            inputSchema: z.object({ value: z.number() }),
            resultSchema: z.object({ value: z.number() }),
        });

        const multiplyWithCache = makePipelineFunction({
            transform: multiply,
            name: 'multiply',
            inputSchema: z.object({ value: z.number() }),
            resultSchema: z.object({ value: z.number() }),
        });

        const combined = async (
            input: z.input<typeof addWithCache.inputSchema>
        ) => {
            const addResult = await addWithCache(input);
            const multiplyResult = await multiplyWithCache(addResult);
            return multiplyResult;
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

it('should work when has one element and persists', async () => {
    const { files, makePipelineFunction } = setup();

    const addWithCache = makePipelineFunction({
        transform: ({ value }) => Promise.resolve({ value: value + 1 }),
        name: 'add',
        inputSchema: z.object({ value: z.number() }),
        resultSchema: z.object({ value: z.number() }),
    });

    expect(await addWithCache({ value: 0 }, { location: './' })).toEqual({
        value: 1,
    });

    expect(Object.fromEntries(files.entries())).toEqual({
        'add-660e.yaml': { value: 1 },
    });
});

it(
    line`
        should work when has one element and transform called multiple 
        times, and persists
    `,
    async () => {
        const { files, makePipelineFunction } = setup();

        const addWithCache = makePipelineFunction({
            transform: ({ value }) => Promise.resolve({ value: value + 1 }),
            name: 'add',
            inputSchema: z.object({ value: z.number() }),
            resultSchema: z.object({ value: z.number() }),
        });

        const stateRef = {
            location: './',
        };

        expect(await addWithCache({ value: 0 }, stateRef)).toEqual({
            value: 1,
        });
        expect(await addWithCache({ value: 1 }, stateRef)).toEqual({
            value: 2,
        });
        expect(await addWithCache({ value: 2 }, stateRef)).toEqual({
            value: 3,
        });

        expect(Object.fromEntries(files.entries())).toEqual({
            'add-660e.yaml': { value: 1 },
            'add-993e.yaml': { value: 2 },
            'add-10bb.yaml': { value: 3 },
        });
    }
);

it('should work when has one element after loading', async () => {
    const { files, makePipelineFunction } = setup();

    Object.entries({
        'add-660e.yaml': { value: 1 },
    }).forEach(([key, value]) => files.set(key, value));

    const add = jest.fn(({ value }: { value: number }) =>
        Promise.resolve({ value: value + 1 })
    );

    const addWithCache = makePipelineFunction({
        transform: add,
        name: 'add',
        inputSchema: z.object({ value: z.number() }),
        resultSchema: z.object({ value: z.number() }),
    });

    const stateRef = {
        location: './',
    };

    expect(await addWithCache({ value: 0 }, stateRef)).toEqual({
        value: 1,
    });

    expect(add).not.toHaveBeenCalledWith();
});

it(
    line`
        should call transform again when persisted hash doesn't match new
        input hash
    `,
    async () => {
        const { files, makePipelineFunction } = setup();

        Object.entries({
            'add-660e.yaml': { value: 1 },
        }).forEach(([key, value]) => files.set(key, value));

        const add = jest.fn(({ value }: { value: number }) =>
            Promise.resolve({ value: value + 1 })
        );

        const addWithCache = makePipelineFunction({
            transform: add,
            name: 'add',
            inputSchema: z.object({ value: z.number() }),
            resultSchema: z.object({ value: z.number() }),
        });

        const stateRef = {
            location: './',
        };

        expect(await addWithCache({ value: 2 }, stateRef)).toEqual({
            value: 3,
        });

        const addPersistence = {
            location: 'add-10bb',
        };

        expect(add).toHaveBeenCalledWith(
            { value: 2 },
            expect.objectContaining(addPersistence)
        );

        expect(Object.fromEntries(files.entries())).toEqual({
            'add-10bb.yaml': { value: 3 },
            'add-660e.yaml': { value: 1 },
        });
    }
);

it('should work when has one element and transform called multiple times', async () => {
    const { files, makePipelineFunction } = setup();

    const add = jest.fn(({ value }: { value: number }) =>
        Promise.resolve({ value: value + 1 })
    );

    const addWithCache = makePipelineFunction({
        transform: add,
        name: 'add',
        inputSchema: z.object({ value: z.number() }),
        resultSchema: z.object({ value: z.number() }),
    });

    const stateRef = {
        location: './',
    };

    expect(await addWithCache({ value: 0 }, stateRef)).toEqual({
        value: 1,
    });
    expect(await addWithCache({ value: 1 }, stateRef)).toEqual({
        value: 2,
    });
    expect(await addWithCache({ value: 2 }, stateRef)).toEqual({
        value: 3,
    });
    expect(await addWithCache({ value: 3 }, stateRef)).toEqual({
        value: 4,
    });

    expect(Object.fromEntries(files.entries())).toEqual({
        'add-660e.yaml': { value: 1 },
        'add-993e.yaml': { value: 2 },
        'add-10bb.yaml': { value: 3 },
        'add-7441.yaml': { value: 4 },
    });

    add.mockClear();

    const refNext = {
        location: stateRef.location,
    };

    expect(await addWithCache({ value: 0 }, refNext)).toEqual({
        value: 1,
    });
    expect(await addWithCache({ value: 1 }, refNext)).toEqual({
        value: 2,
    });
    expect(await addWithCache({ value: 2 }, refNext)).toEqual({
        value: 3,
    });
    expect(await addWithCache({ value: 3 }, refNext)).toEqual({
        value: 4,
    });

    expect(add).not.toHaveBeenCalledWith({ value: 0 }, expect.anything());
    expect(add).not.toHaveBeenCalledWith({ value: 1 }, expect.anything());
    expect(add).not.toHaveBeenCalledWith({ value: 2 }, expect.anything());
    expect(add).not.toHaveBeenCalledWith({ value: 3 }, expect.anything());
});

it(
    line`
        should work when has two elements and transform called multiple
        times with persistence
    `,
    async () => {
        const { files, makePipelineFunction } = setup();

        const add = jest.fn(({ value }: { value: number }) =>
            Promise.resolve({ value: value + 1 })
        );

        const addWithCache = makePipelineFunction({
            transform: add,
            name: 'add',
            inputSchema: z.object({ value: z.number() }),
            resultSchema: z.object({ value: z.number() }),
        });

        const multiply = jest.fn(({ value }: { value: number }) =>
            Promise.resolve({ value: value * 2 })
        );

        const multiplyWithCache = makePipelineFunction({
            transform: multiply,
            name: 'multiply',
            inputSchema: z.object({ value: z.number() }),
            resultSchema: z.object({ value: z.number() }),
        });

        const pipe = async (
            input: z.input<typeof addWithCache.inputSchema>,
            stateRef?: { location?: string }
        ) => {
            const addResult = await addWithCache(input, stateRef);
            return await multiplyWithCache(addResult, stateRef);
        };

        const persistence = { location: './' };

        expect(await pipe({ value: 0 }, persistence)).toEqual({
            value: 2,
        });
        expect(await pipe({ value: 2 }, persistence)).toEqual({
            value: 6,
        });
        expect(await pipe({ value: 6 }, persistence)).toEqual({
            value: 14,
        });

        expect(add).toHaveBeenCalledWith(
            { value: 0 },
            expect.objectContaining({
                location: 'add-660e',
            })
        );
        expect(add).toHaveBeenCalledWith(
            { value: 2 },
            expect.objectContaining({
                location: 'add-10bb',
            })
        );
        expect(add).toHaveBeenCalledWith(
            { value: 6 },
            expect.objectContaining({
                location: 'add-8092',
            })
        );

        expect(multiply).toHaveBeenCalledWith(
            { value: 1 },
            expect.objectContaining({
                location: 'multiply-993e',
            })
        );
        expect(multiply).toHaveBeenCalledWith(
            { value: 3 },
            expect.objectContaining({
                location: 'multiply-7441',
            })
        );
        expect(multiply).toHaveBeenCalledWith(
            { value: 7 },
            expect.objectContaining({
                location: 'multiply-c76d',
            })
        );

        expect(Object.fromEntries(files.entries())).toEqual({
            'add-660e.yaml': { value: 1 },
            'multiply-993e.yaml': { value: 2 },
            'add-10bb.yaml': { value: 3 },
            'multiply-7441.yaml': { value: 6 },
            'add-8092.yaml': { value: 7 },
            'multiply-c76d.yaml': { value: 14 },
        });
    }
);

it('should work when multiple pipelines are combined into one', async () => {
    const { files, makePipelineFunction } = setup();

    const add = jest.fn(({ value }: { value: number }) =>
        Promise.resolve({ value: value + 1 })
    );

    const multiply = jest.fn(({ value }: { value: number }) =>
        Promise.resolve({ value: value * 2 })
    );

    const addWithCache = makePipelineFunction({
        transform: add,
        name: 'add',
        inputSchema: z.object({ value: z.number() }),
        resultSchema: z.object({ value: z.number() }),
    });

    const multiplyWithCache = makePipelineFunction({
        transform: multiply,
        name: 'multiply',
        inputSchema: z.object({ value: z.number() }),
        resultSchema: z.object({ value: z.number() }),
    });

    const subPipe = makePipelineFunction({
        transform: async (
            input: z.input<typeof addWithCache.inputSchema>,
            stateRef
        ) => {
            const addResult = await addWithCache(input, stateRef);
            return await multiplyWithCache(addResult, stateRef);
        },
        name: 'sub-pipe',
        inputSchema: addWithCache.inputSchema,
        resultSchema: multiplyWithCache.resultSchema,
    });

    const pipeParent = async (
        input: z.input<typeof subPipe.inputSchema>,
        stateRef?: { location?: string }
    ) => {
        return await multiplyWithCache(
            await subPipe(input, stateRef),
            stateRef
        );
    };

    const stateRef = { location: './' };

    expect(await pipeParent({ value: 4 }, stateRef)).toEqual({
        value: 20,
    });

    expect(add).toHaveBeenCalled();
    expect(multiply).toHaveBeenCalled();

    expect(Object.fromEntries(files.entries())).toEqual({
        'multiply-26e7.yaml': { value: 20 },
        'sub-pipe-51ea/add-51ea.yaml': { value: 5 },
        'sub-pipe-51ea/multiply-b956.yaml': { value: 10 },
        'sub-pipe-51ea.yaml': { value: 10 },
    });

    add.mockClear();
    multiply.mockClear();

    expect(
        await pipeParent({ value: 4 }, { location: stateRef.location })
    ).toEqual({
        value: 20,
    });

    expect(add).not.toHaveBeenCalled();
    expect(multiply).not.toHaveBeenCalled();
});

it('should delete old cache files when clean is called', async () => {
    const { deps, files, makePipelineFunction, cleanCache } = setup();

    Object.entries({
        'add-660e.yaml': { value: 1 },
    }).forEach(([key, value]) => files.set(key, value));

    const add = jest.fn(({ value }: { value: number }) =>
        Promise.resolve({ value: value + 1 })
    );

    const addWithCache = makePipelineFunction(
        {
            transform: add,
            name: 'add',
            inputSchema: z.object({ value: z.number() }),
            resultSchema: z.object({ value: z.number() }),
        },
        deps
    );

    const stateRef = {
        location: './',
    };

    expect(await addWithCache({ value: 2 }, stateRef)).toEqual({
        value: 3,
    });

    const addPersistence = {
        location: 'add-10bb',
    };

    expect(add).toHaveBeenCalledWith(
        { value: 2 },
        expect.objectContaining(addPersistence)
    );

    expect(Object.fromEntries(files.entries())).toEqual({
        'add-10bb.yaml': { value: 3 },
        'add-660e.yaml': { value: 1 },
    });

    await cleanCache(stateRef);

    expect(Object.fromEntries(files.entries())).toEqual({
        'add-10bb.yaml': { value: 3 },
    });
});

it('should clean only on executed levels', async () => {
    const { deps, files, makePipelineFunction, cleanCache } = setup();

    Object.entries({
        'sub-pipe-51ea/add-51ea.yaml': { value: 5 },
        'sub-pipe-51ea/add-xxyy.yaml': { value: 5 },
        'sub-pipe-51ea/multiply-b956.yaml': { value: 10 },
        'sub-pipe-51ea/multiply-xxyy.yaml': { value: 5 },
        'sub-pipe-51ea.yaml': { value: 10 },
        'sub-pipe-xxxx/add-51ea.yaml': { value: 5 },
        'sub-pipe-xxxx/add-xxyy.yaml': { value: 5 },
        'sub-pipe-xxxx/multiply-b956.yaml': { value: 10 },
        'sub-pipe-xxxx/multiply-xxyy.yaml': { value: 5 },
        'sub-pipe-xxxx.yaml': { value: 15 },
        'multiply-26e7.yaml': { value: 20 },
        'multiply-xxxx.yaml': { value: 30 },
    }).forEach(([key, value]) => files.set(key, value));

    const add = jest.fn(({ value }: { value: number }) =>
        Promise.resolve({ value: value + 1 })
    );

    const multiply = jest.fn(({ value }: { value: number }) =>
        Promise.resolve({ value: value * 2 })
    );

    const addFn = makePipelineFunction({
        name: 'add',
        transform: add,
        inputSchema: z.object({ value: z.number() }),
        resultSchema: z.object({ value: z.number() }),
    });

    const multiplyFn = makePipelineFunction({
        name: 'multiply',
        transform: multiply,
        inputSchema: z.object({ value: z.number() }),
        resultSchema: z.object({ value: z.number() }),
    });

    const subPipeFn = makePipelineFunction({
        name: 'sub-pipe',
        transform: async (
            { value }: { value: number },
            stateRef?: { location?: string }
        ) => {
            const pipe = async (
                input: { value: number },
                stateRef?: { location?: string }
            ) => {
                return multiplyFn(await addFn(input, stateRef), stateRef);
            };

            try {
                return await pipe({ value }, stateRef);
            } finally {
                if (stateRef) {
                    await cleanCache(stateRef);
                }
            }
        },
        inputSchema: z.object({ value: z.number() }),
        resultSchema: z.object({ value: z.number() }),
    });

    const pipeParent = async (
        input: { value: number },
        stateRef?: { location?: string }
    ) => {
        return await multiplyFn(await subPipeFn(input, stateRef), stateRef);
    };

    const persistence = { location: './' };

    expect(await pipeParent({ value: 4 }, persistence)).toEqual({
        value: 20,
    });

    await cleanCache(persistence, deps);

    /**
     * @note note that files with xxxx hash deleted but not files with xxyy hash
     */
    expect(Object.fromEntries(files.entries())).toEqual({
        'multiply-26e7.yaml': { value: 20 },
        'sub-pipe-51ea.yaml': { value: 10 },
        'sub-pipe-51ea/add-51ea.yaml': { value: 5 },
        'sub-pipe-51ea/add-xxyy.yaml': { value: 5 },
        'sub-pipe-51ea/multiply-b956.yaml': { value: 10 },
        'sub-pipe-51ea/multiply-xxyy.yaml': { value: 5 },
    });

    files.delete('sub-pipe-51ea.yaml');

    const newRun = {
        location: persistence.location,
        info: 'new-run',
    };

    add.mockClear();
    multiply.mockClear();

    expect(await pipeParent({ value: 4 }, newRun)).toEqual({
        value: 20,
    });

    /**
     * @note note that files with xxyy hash deleted now
     */
    expect(Object.fromEntries(files.entries())).toEqual({
        'sub-pipe-51ea/add-51ea.yaml': { value: 5 },
        'sub-pipe-51ea/multiply-b956.yaml': { value: 10 },
        'sub-pipe-51ea.yaml': { value: 10 },
        'multiply-26e7.yaml': { value: 20 },
    });
});

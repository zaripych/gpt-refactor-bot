import { expect, it, jest } from '@jest/globals';
import mm from 'micromatch';
import { relative } from 'path';
import { z } from 'zod';

import { looselyTypedMock } from '../utils/createMock';
import { defaultDeps } from './dependencies';
import { makePipelineFunction } from './makePipelineFunction';
import { pipeline } from './pipeline';

const setup = () => {
    const files = new Map<string, unknown>();

    const deps = looselyTypedMock<typeof defaultDeps>({
        ...defaultDeps,
        logger: {
            logLevel: 'debug',
            debug: jest.fn(),
            log: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            tip: jest.fn(),
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
            (patterns: string[], opts: { cwd: string; ignore: string[] }) => {
                const result = [];
                for (const [key] of files) {
                    const relativeKeyPath = relative(opts.cwd, key);
                    if (mm.isMatch(relativeKeyPath, patterns, opts)) {
                        result.push(relativeKeyPath);
                    }
                }
                return Promise.resolve(result);
            }
        ),
        unlink: jest.fn((path: string) => {
            files.delete(path);
        }),
        rename: jest.fn(),
        hash: jest.fn(defaultDeps.hash),
        saveInput: false,
    });
    expect(deps.dumpYaml.mock.calls).toBeTruthy();

    return { deps, files };
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
});

it('should work when empty without persistence', async () => {
    const { deps, files } = setup();

    const pipe = pipeline(z.object({}), deps);

    expect(await pipe.transform({})).toEqual({});

    expect(Object.fromEntries(files.entries())).toEqual({});
});

it('should work when has one element without persistence', async () => {
    const { deps, files } = setup();

    const add = jest.fn(({ value }: { value: number }) =>
        Promise.resolve({ value: value + 1 })
    );

    const pipe = pipeline(z.object({ value: z.number() }), deps).append({
        name: 'add',
        transform: add,
        inputSchema: z.object({ value: z.number() }),
        resultSchema: z.object({ value: z.number() }),
    });

    expect(await pipe.transform({ value: 0 })).toEqual({ value: 1 });

    expect(add).toHaveBeenCalledWith({ value: 0 });

    expect(Object.fromEntries(files.entries())).toEqual({});
});

it('should add Zod defaults before the functions is called', async () => {
    const { deps, files } = setup();

    const add = jest.fn(({ value }: { value: number }) =>
        Promise.resolve({ value: value + 1 })
    );

    const pipe = pipeline(z.object({ value: z.number() }), deps).append({
        name: 'add',
        transform: add,
        inputSchema: z.object({
            value: z.number(),
            default: z.string().default('value'),
        }),
        resultSchema: z.object({ value: z.number() }),
    });

    expect(await pipe.transform({ value: 0 })).toEqual({ value: 1 });

    expect(add).toHaveBeenCalledWith({
        value: 0,
        default: 'value',
    });

    expect(Object.fromEntries(files.entries())).toEqual({});
});

it('should work when has one element with persistence', async () => {
    const { deps, files } = setup();

    const add = jest.fn(({ value }: { value: number }) =>
        Promise.resolve({ value: value + 1 })
    );

    const pipe = pipeline(z.object({ value: z.number() }), deps).append({
        name: 'add',
        transform: add,
        inputSchema: z.object({ value: z.number() }),
        resultSchema: z.object({ value: z.number() }),
    });

    expect(await pipe.transform({ value: 0 }, { location: './' })).toEqual({
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
    const { deps, files } = setup();

    const add = jest.fn(({ value }: { value: number }) =>
        Promise.resolve({ value: value + 1 })
    );

    const pipe = pipeline(z.object({ value: z.number() }), deps).append({
        name: 'add',
        transform: add,
        inputSchema: z.object({ value: z.number() }),
        resultSchema: z.object({ value: z.number() }),
    });

    expect(await pipe.transform({ value: 0 })).toEqual({ value: 1 });
    expect(await pipe.transform({ value: 1 })).toEqual({ value: 2 });
    expect(await pipe.transform({ value: 2 })).toEqual({ value: 3 });

    expect(add).toHaveBeenCalledWith({ value: 0 });
    expect(add).toHaveBeenCalledWith({ value: 1 });
    expect(add).toHaveBeenCalledWith({ value: 2 });

    expect(Object.fromEntries(files.entries())).toEqual({});
});

it('should work when has one element and transform called multiple times with exactly same input for non-deterministic function', async () => {
    const { deps } = setup();

    const add = jest.fn((_: { value: number }) =>
        Promise.resolve({ value: Math.random() })
    );

    const pipe = pipeline(z.object({ value: z.number() }), deps).append({
        name: 'add',
        type: 'non-deterministic',
        transform: add,
        inputSchema: z.object({ value: z.number() }),
        resultSchema: z.object({ value: z.number() }),
    });

    const persistence = { location: '.' };

    expect(await pipe.transform({ value: 1 }, persistence)).toEqual({
        value: expect.any(Number),
    });
    expect(await pipe.transform({ value: 1 }, persistence)).toEqual({
        value: expect.any(Number),
    });
    expect(await pipe.transform({ value: 1 }, persistence)).toEqual({
        value: expect.any(Number),
    });

    /**
     * @note non-deterministic functions receive a new hash
     * every time they are called again with same input
     */
    expect(add).toHaveBeenCalledTimes(3);

    expect(pipe.log).toEqual([
        'add-993e.yaml',
        'add-cd8d.yaml',
        'add-2207.yaml',
    ]);
});

it('should work when has one element and transform called multiple times with exactly same input for non-deterministic function', async () => {
    const { deps } = setup();

    const add = jest.fn((_: { value: number }) =>
        Promise.resolve({ value: Math.random() })
    );

    const pipe = pipeline(z.object({ value: z.number() }), deps).append({
        name: 'add',
        type: 'deterministic',
        transform: add,
        inputSchema: z.object({ value: z.number() }),
        resultSchema: z.object({ value: z.number() }),
    });

    const persistence = { location: '.' };

    expect(await pipe.transform({ value: 1 }, persistence)).toEqual({
        value: expect.any(Number),
    });
    expect(await pipe.transform({ value: 1 }, persistence)).toEqual({
        value: expect.any(Number),
    });
    expect(await pipe.transform({ value: 1 }, persistence)).toEqual({
        value: expect.any(Number),
    });

    /**
     * @note deterministic functions will have the same hash
     */
    expect(add).toHaveBeenCalledTimes(1);

    expect(pipe.log).toEqual([
        'add-993e.yaml',
        'add-993e.yaml',
        'add-993e.yaml',
    ]);
});

it('should work when has two elements without persistence', async () => {
    const { deps, files } = setup();

    const add = jest.fn(({ value }: { value: number }) =>
        Promise.resolve({ value: value + 1 })
    );

    const multiply = jest.fn(({ value }: { value: number }) =>
        Promise.resolve({ value: value * 2 })
    );

    const pipe = pipeline(z.object({ value: z.number() }), deps)
        .append({
            name: 'add',
            transform: add,
            inputSchema: z.object({ value: z.number() }),
            resultSchema: z.object({ value: z.number() }),
        })
        .append({
            name: 'multiply',
            transform: multiply,
            inputSchema: z.object({ value: z.number() }),
            resultSchema: z.object({ value: z.number() }),
        });

    expect(await pipe.transform({ value: 0 })).toEqual({ value: 2 });

    expect(add).toHaveBeenCalledWith({ value: 0 });
    expect(multiply).toHaveBeenCalledWith({ value: 1 });

    expect(Object.fromEntries(files.entries())).toEqual({});
});

it('should work when has two elements and transform called multiple times', async () => {
    const { deps, files } = setup();

    const add = jest.fn(({ value }: { value: number }) =>
        Promise.resolve({ value: value + 1 })
    );

    const multiply = jest.fn(({ value }: { value: number }) =>
        Promise.resolve({ value: value * 2 })
    );

    const pipe = pipeline(z.object({ value: z.number() }), deps)
        .append({
            name: 'add',
            transform: add,
            inputSchema: z.object({ value: z.number() }),
            resultSchema: z.object({ value: z.number() }),
        })
        .append({
            name: 'multiply',
            transform: multiply,
            inputSchema: z.object({ value: z.number() }),
            resultSchema: z.object({ value: z.number() }),
        });

    expect(await pipe.transform({ value: 0 })).toEqual({ value: 2 });
    expect(await pipe.transform({ value: 2 })).toEqual({ value: 6 });
    expect(await pipe.transform({ value: 6 })).toEqual({ value: 14 });

    expect(add).toHaveBeenCalledWith({ value: 0 });
    expect(add).toHaveBeenCalledWith({ value: 2 });
    expect(add).toHaveBeenCalledWith({ value: 6 });

    expect(Object.fromEntries(files.entries())).toEqual({});
});

it('should work when has one element and persists', async () => {
    const { deps, files } = setup();

    const pipe = pipeline(z.object({ value: z.number() }), deps).append({
        name: 'add',
        transform: ({ value }) => Promise.resolve({ value: value + 1 }),
        inputSchema: z.object({ value: z.number() }),
        resultSchema: z.object({ value: z.number() }),
    });

    expect(await pipe.transform({ value: 0 }, { location: './' })).toEqual({
        value: 1,
    });

    expect(Object.fromEntries(files.entries())).toEqual({
        'add-660e.yaml': { value: 1 },
    });
});

it('should work when has one element and transform called multiple times, and persists', async () => {
    const { deps, files } = setup();

    const pipe = pipeline(z.object({ value: z.number() }), deps).append({
        name: 'add',
        transform: ({ value }) => Promise.resolve({ value: value + 1 }),
        inputSchema: z.object({ value: z.number() }),
        resultSchema: z.object({ value: z.number() }),
    });

    const persistence = {
        location: './',
    };

    expect(await pipe.transform({ value: 0 }, persistence)).toEqual({
        value: 1,
    });
    expect(await pipe.transform({ value: 1 }, persistence)).toEqual({
        value: 2,
    });
    expect(await pipe.transform({ value: 2 }, persistence)).toEqual({
        value: 3,
    });

    expect(Object.fromEntries(files.entries())).toEqual({
        'add-660e.yaml': { value: 1 },
        'add-993e.yaml': { value: 2 },
        'add-10bb.yaml': { value: 3 },
    });
});

it('should work when has one element after loading', async () => {
    const { deps, files } = setup();

    Object.entries({
        'add-660e.yaml': { value: 1 },
    }).forEach(([key, value]) => files.set(key, value));

    const add = jest.fn(({ value }: { value: number }) =>
        Promise.resolve({ value: value + 1 })
    );

    const pipe = pipeline(z.object({ value: z.number() }), deps).append({
        name: 'add',
        transform: add,
        inputSchema: z.object({ value: z.number() }),
        resultSchema: z.object({ value: z.number() }),
    });

    const persistence = {
        location: './',
    };

    expect(await pipe.transform({ value: 0 }, persistence)).toEqual({
        value: 1,
    });

    expect(add).not.toHaveBeenCalledWith();
});

it('should call transform again when persisted hash doesnt match new input hash', async () => {
    const { deps, files } = setup();

    Object.entries({
        'add-660e.yaml': { value: 1 },
    }).forEach(([key, value]) => files.set(key, value));

    const add = jest.fn(({ value }: { value: number }) =>
        Promise.resolve({ value: value + 1 })
    );

    const pipe = pipeline(z.object({ value: z.number() }), deps).append({
        name: 'add',
        transform: add,
        inputSchema: z.object({ value: z.number() }),
        resultSchema: z.object({ value: z.number() }),
    });

    const persistence = {
        location: './',
    };

    expect(await pipe.transform({ value: 2 }, persistence)).toEqual({
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
});

it('should work when has one element after loading', async () => {
    const { deps, files } = setup();

    Object.entries({
        'add-660e.yaml': { value: 1 },
    }).forEach(([key, value]) => files.set(key, value));

    const add = jest.fn(({ value }: { value: number }) =>
        Promise.resolve({ value: value + 1 })
    );

    const pipe = pipeline(z.object({ value: z.number() }), deps).append({
        name: 'add',
        transform: add,
        inputSchema: z.object({ value: z.number() }),
        resultSchema: z.object({ value: z.number() }),
    });

    const persistence = {
        location: './',
    };

    expect(await pipe.transform({ value: 0 }, persistence)).toEqual({
        value: 1,
    });

    expect(add).not.toHaveBeenCalled();
});

it('should work when has one element and transform called multiple times', async () => {
    const { deps, files } = setup();

    const add = jest.fn(({ value }: { value: number }) =>
        Promise.resolve({ value: value + 1 })
    );

    const pipe = pipeline(z.object({ value: z.number() }), deps).append({
        name: 'add',
        transform: add,
        inputSchema: z.object({ value: z.number() }),
        resultSchema: z.object({ value: z.number() }),
    });

    const persistence = {
        location: './',
    };

    expect(await pipe.transform({ value: 0 }, persistence)).toEqual({
        value: 1,
    });
    expect(await pipe.transform({ value: 1 }, persistence)).toEqual({
        value: 2,
    });
    expect(await pipe.transform({ value: 2 }, persistence)).toEqual({
        value: 3,
    });
    expect(await pipe.transform({ value: 3 }, persistence)).toEqual({
        value: 4,
    });

    expect(Object.fromEntries(files.entries())).toEqual({
        'add-660e.yaml': { value: 1 },
        'add-993e.yaml': { value: 2 },
        'add-10bb.yaml': { value: 3 },
        'add-7441.yaml': { value: 4 },
    });

    add.mockClear();

    const persistenceNext = {
        location: persistence.location,
    };

    expect(await pipe.transform({ value: 0 }, persistenceNext)).toEqual({
        value: 1,
    });
    expect(await pipe.transform({ value: 1 }, persistenceNext)).toEqual({
        value: 2,
    });
    expect(await pipe.transform({ value: 2 }, persistenceNext)).toEqual({
        value: 3,
    });
    expect(await pipe.transform({ value: 3 }, persistenceNext)).toEqual({
        value: 4,
    });

    expect(add).not.toHaveBeenCalledWith({ value: 0 }, expect.anything());
    expect(add).not.toHaveBeenCalledWith({ value: 1 }, expect.anything());
    expect(add).not.toHaveBeenCalledWith({ value: 2 }, expect.anything());
    expect(add).not.toHaveBeenCalledWith({ value: 3 }, expect.anything());
});

it('should work when has two elements and transform called multiple times with persistence', async () => {
    const { deps, files } = setup();

    const add = jest.fn(({ value }: { value: number }) =>
        Promise.resolve({ value: value + 1 })
    );

    const multiply = jest.fn(({ value }: { value: number }) =>
        Promise.resolve({ value: value * 2 })
    );

    const pipe = pipeline(z.object({ value: z.number() }), deps)
        .append({
            name: 'add',
            transform: add,
            inputSchema: z.object({ value: z.number() }),
            resultSchema: z.object({ value: z.number() }),
        })
        .append({
            name: 'multiply',
            transform: multiply,
            inputSchema: z.object({ value: z.number() }),
            resultSchema: z.object({ value: z.number() }),
        });

    const persistence = { location: './' };

    expect(await pipe.transform({ value: 0 }, persistence)).toEqual({
        value: 2,
    });
    expect(await pipe.transform({ value: 2 }, persistence)).toEqual({
        value: 6,
    });
    expect(await pipe.transform({ value: 6 }, persistence)).toEqual({
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
});

it('should work when multiple pipelines are combined into one', async () => {
    const { deps, files } = setup();

    const add = jest.fn(({ value }: { value: number }) =>
        Promise.resolve({ value: value + 1 })
    );

    const multiply = jest.fn(({ value }: { value: number }) =>
        Promise.resolve({ value: value * 2 })
    );

    const subPipe = pipeline(z.object({ value: z.number() }), deps)
        .append({
            name: 'add',
            transform: add,
            inputSchema: z.object({ value: z.number() }),
            resultSchema: z.object({ value: z.number() }),
        })
        .append({
            name: 'multiply',
            transform: multiply,
            inputSchema: z.object({ value: z.number() }),
            resultSchema: z.object({ value: z.number() }),
        });

    const pipeParent = pipeline(z.object({ value: z.number() }), deps)
        .append({
            name: 'sub-pipe',
            ...subPipe,
        })
        .append({
            name: 'multiply',
            transform: multiply,
            inputSchema: z.object({ value: z.number() }),
            resultSchema: z.object({ value: z.number() }),
        });

    const persistence = { location: './' };

    expect(await pipeParent.transform({ value: 4 }, persistence)).toEqual({
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
        await pipeParent.transform(
            { value: 4 },
            { location: persistence.location }
        )
    ).toEqual({
        value: 20,
    });

    expect(add).not.toHaveBeenCalled();
    expect(multiply).not.toHaveBeenCalled();
});

it('should work when multiple pipelines are combined via calls', async () => {
    const { deps, files } = setup();

    const add = jest.fn(({ value }: { value: number }) =>
        Promise.resolve({ value: value + 1 })
    );

    const multiply = jest.fn(({ value }: { value: number }) =>
        Promise.resolve({ value: value * 2 })
    );

    const pipeParent = pipeline(z.object({ value: z.number() }), deps)
        .append({
            name: 'sub-pipe',
            transform: async (
                { value }: { value: number },
                persistence?: { location: string }
            ) => {
                const subPipe = pipeline(z.object({ value: z.number() }), deps)
                    .append({
                        name: 'add',
                        transform: add,
                        inputSchema: z.object({ value: z.number() }),
                        resultSchema: z.object({ value: z.number() }),
                    })
                    .append({
                        name: 'multiply',
                        transform: multiply,
                        inputSchema: z.object({ value: z.number() }),
                        resultSchema: z.object({ value: z.number() }),
                    });

                return await subPipe.transform({ value }, persistence);
            },
            inputSchema: z.object({ value: z.number() }),
            resultSchema: z.object({ value: z.number() }),
        })
        .append({
            name: 'multiply',
            transform: multiply,
            inputSchema: z.object({ value: z.number() }),
            resultSchema: z.object({ value: z.number() }),
        });

    const persistence = { location: './' };

    expect(await pipeParent.transform({ value: 4 }, persistence)).toEqual({
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
        await pipeParent.transform(
            { value: 4 },
            { location: persistence.location }
        )
    ).toEqual({
        value: 20,
    });

    expect(add).not.toHaveBeenCalled();
    expect(multiply).not.toHaveBeenCalled();
});

it('should work when multiple pipelines are combined with makePipelineFunction', async () => {
    const { deps, files } = setup();

    const add = jest.fn(({ value }: { value: number }) =>
        Promise.resolve({ value: value + 1 })
    );

    const multiply = jest.fn(({ value }: { value: number }) =>
        Promise.resolve({ value: value * 2 })
    );

    const subPipeFn = makePipelineFunction({
        name: 'sub-pipe',
        transform: async (
            { value }: { value: number },
            persistence?: { location: string }
        ) => {
            const subSubPipe = pipeline(z.object({ value: z.number() }), deps)
                .append({
                    name: 'add',
                    transform: add,
                    inputSchema: z.object({ value: z.number() }),
                    resultSchema: z.object({ value: z.number() }),
                })
                .append({
                    name: 'multiply',
                    transform: multiply,
                    inputSchema: z.object({ value: z.number() }),
                    resultSchema: z.object({ value: z.number() }),
                });

            return subSubPipe.transform({ value }, persistence);
        },
        inputSchema: z.object({ value: z.number() }),
        resultSchema: z.object({ value: z.number() }),
    });

    const pipeParent = pipeline(z.object({ value: z.number() }), deps)
        .append(subPipeFn)
        .append({
            name: 'multiply',
            transform: multiply,
            inputSchema: z.object({ value: z.number() }),
            resultSchema: z.object({ value: z.number() }),
        });

    const persistence = { location: './' };

    expect(await pipeParent.transform({ value: 4 }, persistence)).toEqual({
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
        await pipeParent.transform(
            { value: 4 },
            { location: persistence.location }
        )
    ).toEqual({
        value: 20,
    });

    expect(add).not.toHaveBeenCalled();
    expect(multiply).not.toHaveBeenCalled();
});

it('should work when makePipelineFunction.withPersistence is used', async () => {
    const { deps, files } = setup();

    const add = jest.fn(({ value }: { value: number }) =>
        Promise.resolve({ value: value + 1 })
    );

    const multiply = jest.fn(({ value }: { value: number }) =>
        Promise.resolve({ value: value * 2 })
    );

    const addFn = makePipelineFunction(
        {
            name: 'add',
            transform: add,
            inputSchema: z.object({ value: z.number() }),
            resultSchema: z.object({ value: z.number() }),
        },
        deps
    );

    const multiplyFn = makePipelineFunction(
        {
            name: 'multiply',
            transform: multiply,
            inputSchema: z.object({ value: z.number() }),
            resultSchema: z.object({ value: z.number() }),
        },
        deps
    );

    const subPipeFn = makePipelineFunction(
        {
            name: 'sub-pipe',
            transform: async (
                { value }: { value: number },
                persistence?: { location: string }
            ) => {
                return await addFn
                    .withPersistence()
                    .append(multiplyFn)
                    .transform({ value }, persistence);
            },
            inputSchema: z.object({ value: z.number() }),
            resultSchema: z.object({ value: z.number() }),
        },
        deps
    );

    const persistence = { location: './' };

    expect(
        await subPipeFn.withPersistence().transform({ value: 4 }, persistence)
    ).toEqual({
        value: 10,
    });

    expect(add).toHaveBeenCalled();
    expect(multiply).toHaveBeenCalled();

    expect(Object.fromEntries(files.entries())).toEqual({
        'sub-pipe-51ea/add-51ea.yaml': { value: 5 },
        'sub-pipe-51ea/multiply-b956.yaml': { value: 10 },
        'sub-pipe-51ea.yaml': { value: 10 },
    });

    add.mockClear();
    multiply.mockClear();

    expect(
        await subPipeFn
            .withPersistence()
            .transform({ value: 4 }, { location: persistence.location })
    ).toEqual({
        value: 10,
    });

    expect(add).not.toHaveBeenCalled();
    expect(multiply).not.toHaveBeenCalled();
});

it('should work when makePipelineFunction.withPersistence is used', async () => {
    const { deps, files } = setup();

    const add = jest.fn(({ value }: { value: number }) =>
        Promise.resolve({ value: value + 1 })
    );

    const multiply = jest.fn(({ value }: { value: number }) =>
        Promise.resolve({ value: value * 2 })
    );

    const addFn = makePipelineFunction(
        {
            name: 'add',
            transform: add,
            inputSchema: z.object({ value: z.number() }),
            resultSchema: z.object({ value: z.number() }),
        },
        deps
    );

    const multiplyFn = makePipelineFunction(
        {
            name: 'multiply',
            transform: multiply,
            inputSchema: z.object({ value: z.number() }),
            resultSchema: z.object({ value: z.number() }),
        },
        deps
    );

    const subPipeFn = makePipelineFunction(
        {
            name: 'sub-pipe',
            transform: async (
                { value }: { value: number },
                persistence?: { location: string }
            ) => {
                return await addFn
                    .withPersistence()
                    .append(multiplyFn)
                    .transform({ value }, persistence);
            },
            inputSchema: z.object({ value: z.number() }),
            resultSchema: z.object({ value: z.number() }),
        },
        deps
    );

    const persistence = { location: './' };

    expect(
        await subPipeFn.withPersistence().transform({ value: 4 }, persistence)
    ).toEqual({
        value: 10,
    });

    expect(add).toHaveBeenCalled();
    expect(multiply).toHaveBeenCalled();

    expect(Object.fromEntries(files.entries())).toEqual({
        'sub-pipe-51ea/add-51ea.yaml': { value: 5 },
        'sub-pipe-51ea/multiply-b956.yaml': { value: 10 },
        'sub-pipe-51ea.yaml': { value: 10 },
    });

    add.mockClear();
    multiply.mockClear();

    expect(
        await subPipeFn
            .withPersistence()
            .transform({ value: 4 }, { location: persistence.location })
    ).toEqual({
        value: 10,
    });

    expect(add).not.toHaveBeenCalled();
    expect(multiply).not.toHaveBeenCalled();
});

it('should delete old cache files when clean is called', async () => {
    const { deps, files } = setup();

    Object.entries({
        'add-660e.yaml': { value: 1 },
    }).forEach(([key, value]) => files.set(key, value));

    const add = jest.fn(({ value }: { value: number }) =>
        Promise.resolve({ value: value + 1 })
    );

    const pipe = pipeline(z.object({ value: z.number() }), deps).append({
        name: 'add',
        transform: add,
        inputSchema: z.object({ value: z.number() }),
        resultSchema: z.object({ value: z.number() }),
    });

    const persistence = {
        location: './',
    };

    expect(await pipe.transform({ value: 2 }, persistence)).toEqual({
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

    await pipe.clean(persistence);

    expect(Object.fromEntries(files.entries())).toEqual({
        'add-10bb.yaml': { value: 3 },
    });
});

it('should clean only on executed levels', async () => {
    const { deps, files } = setup();

    Object.entries({
        'sub-pipe-51ea/add-51ea.yaml': { value: 5 },
        'sub-pipe-51ea/add-xxyy.yaml': { value: 5 },
        'sub-pipe-51ea/multiply-b956.yaml': { value: 10 },
        'sub-pipe-51ea/multiply-xxyy.yaml': { value: 5 },
        'sub-pipe-51ea.yaml': { value: 10 },
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

    const addFn = makePipelineFunction(
        {
            name: 'add',
            transform: add,
            inputSchema: z.object({ value: z.number() }),
            resultSchema: z.object({ value: z.number() }),
        },
        deps
    );

    const multiplyFn = makePipelineFunction(
        {
            name: 'multiply',
            transform: multiply,
            inputSchema: z.object({ value: z.number() }),
            resultSchema: z.object({ value: z.number() }),
        },
        deps
    );

    const subPipeFn = makePipelineFunction(
        {
            name: 'sub-pipe',
            transform: async (
                { value }: { value: number },
                persistence?: { location: string }
            ) => {
                const pipe = addFn.withPersistence().append(multiplyFn);

                try {
                    return await pipe.transform({ value }, persistence);
                } finally {
                    if (persistence) {
                        await pipe.clean(persistence);
                    }
                }
            },
            inputSchema: z.object({ value: z.number() }),
            resultSchema: z.object({ value: z.number() }),
        },
        deps
    );

    const pipeParent = subPipeFn.withPersistence().append({
        name: 'multiply',
        transform: multiply,
        inputSchema: z.object({ value: z.number() }),
        resultSchema: z.object({ value: z.number() }),
    });

    const persistence = { location: './' };

    expect(await pipeParent.transform({ value: 4 }, persistence)).toEqual({
        value: 20,
    });

    //expect(add).not.toHaveBeenCalled();
    //expect(multiply).not.toHaveBeenCalled();

    await pipeParent.clean(persistence);

    /**
     * @note note that files with xxxx hash deleted but not files with xxyy hash
     */
    expect(Object.fromEntries(files.entries())).toEqual({
        'sub-pipe-51ea/add-51ea.yaml': { value: 5 },
        'sub-pipe-51ea/multiply-b956.yaml': { value: 10 },
        'sub-pipe-51ea.yaml': { value: 10 },
        'multiply-26e7.yaml': { value: 20 },
        'sub-pipe-51ea/add-xxyy.yaml': { value: 5 },
        'sub-pipe-51ea/multiply-xxyy.yaml': { value: 5 },
    });

    files.delete('sub-pipe-51ea.yaml');

    const newRun = {
        location: persistence.location,
        info: 'new-run',
    };

    add.mockClear();
    multiply.mockClear();

    expect(await pipeParent.transform({ value: 4 }, newRun)).toEqual({
        value: 20,
    });

    await pipeParent.clean(newRun);

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

it('should retry and invalidate the cache via attempt parameter', async () => {
    const { deps, files } = setup();

    const add = jest.fn(({ value }: { value: number }) =>
        Promise.resolve({ value: value + 1 })
    );

    const multiplyOrFail = jest.fn(({ value }: { value: number }) => {
        return Promise.resolve({ value: value * 2 });
    });

    const addFn = makePipelineFunction(
        {
            name: 'add',
            transform: add,
            inputSchema: z.object({ value: z.number() }),
            resultSchema: z.object({ value: z.number() }),
        },
        deps
    );

    const multiplyFn = makePipelineFunction(
        {
            name: 'multiply',
            transform: multiplyOrFail,
            inputSchema: z.object({ value: z.number() }),
            resultSchema: z.object({ value: z.number() }),
        },
        deps
    );

    const testPipeFn = makePipelineFunction(
        {
            name: 'test-pipe',
            transform: async (
                input: { value: number; attempt?: number },
                persistence?: { location: string }
            ) => {
                const pipe = addFn.withPersistence().append(multiplyFn);
                try {
                    const result = await pipe.transform(input, persistence);
                    if ((input.attempt ?? 1) < 2) {
                        throw new Error('Result is less than 10');
                    }
                    return result;
                } finally {
                    if (persistence) {
                        await pipe.clean(persistence);
                    }
                }
            },
            inputSchema: z.object({ value: z.number() }),
            resultSchema: z.object({ value: z.number() }),
        },
        deps
    );

    const persistence = { location: './' };

    const testPipe = testPipeFn.withPersistence().retry({
        /**
         * @note 2 attempts is enough to
         */
        maxAttempts: 2,
    });

    expect(await testPipe.transform({ value: 5 }, persistence)).toEqual({
        attempt: 2,
        value: 12,
    });

    /**
     * @note actually called two times because of retry, even though
     * the first time the result was cached, it was discarded second
     * time because the error caused the "input" hash value of a parent
     * function to change (different attempt number)
     */
    expect(add).toHaveBeenCalledTimes(2);

    expect(Object.fromEntries(files.entries())).toEqual({
        'test-pipe-418f/add-b956.yaml': { value: 6 },
        'test-pipe-418f/multiply-8092.yaml': { value: 12 },
        'test-pipe-5bb6.yaml': { value: 12 },
        'test-pipe-5bb6/add-b956.yaml': { value: 6 },
        'test-pipe-5bb6/multiply-8092.yaml': { value: 12 },
    });
    expect(testPipe.log).toEqual([
        'test-pipe-418f/add-b956.yaml',
        'test-pipe-418f/multiply-8092.yaml',
        'test-pipe-5bb6/add-b956.yaml',
        'test-pipe-5bb6/multiply-8092.yaml',
        'test-pipe-5bb6.yaml',
    ]);
});

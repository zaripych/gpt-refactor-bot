import { expect, it, jest } from '@jest/globals';
import mm from 'micromatch';
import { normalize, relative } from 'path';
import { z } from 'zod';

import { looselyTypedMock } from '../utils/createMock';
import { defaultDeps } from './dependencies';
import { makePipelineFunction } from './makePipelineFunction';
import { pipeline } from './pipeline';

const setup = () => {
    const files = new Map<string, unknown>();

    const deps = looselyTypedMock<typeof defaultDeps>({
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
        readdir: jest.fn((path: string) => {
            const prefix = normalize(path + '/');
            return Promise.resolve(
                [...files.entries()].flatMap((entry) => {
                    if (prefix === './' && !entry[0].includes('/')) {
                        return [entry[0]];
                    } else if (
                        entry[0].startsWith(prefix) &&
                        !entry[0].substring(prefix.length).includes('/')
                    ) {
                        return [entry[0].substring(prefix.length)];
                    } else {
                        return [];
                    }
                })
            );
        }),
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
        expect.objectContaining({ location: 'add' })
    );

    expect(Object.fromEntries(files.entries())).toEqual({
        'add/add-660e.yaml': { value: 1 },
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
        'add/add-660e.yaml': { value: 1 },
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
        'add/add-660e.yaml': { value: 1 },
        'add/add-993e.yaml': { value: 2 },
        'add/add-10bb.yaml': { value: 3 },
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
        'add/add-660e.yaml': { value: 1 },
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
        location: 'add',
    };

    expect(add).toHaveBeenCalledWith(
        { value: 2 },
        expect.objectContaining(addPersistence)
    );

    expect(Object.fromEntries(files.entries())).toEqual({
        'add/add-10bb.yaml': { value: 3 },
        'add/add-660e.yaml': { value: 1 },
    });
});

it('should work when has one element after loading', async () => {
    const { deps, files } = setup();

    Object.entries({
        'add/add-660e.yaml': { value: 1 },
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

it('should delete old cache files when clean is called', async () => {
    const { deps, files } = setup();

    Object.entries({
        'add/add-660e.yaml': { value: 1 },
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
        location: 'add',
    };

    expect(add).toHaveBeenCalledWith(
        { value: 2 },
        expect.objectContaining(addPersistence)
    );

    expect(Object.fromEntries(files.entries())).toEqual({
        'add/add-10bb.yaml': { value: 3 },
        'add/add-660e.yaml': { value: 1 },
    });

    await pipe.clean(persistence);

    expect(Object.fromEntries(files.entries())).toEqual({
        'add/add-10bb.yaml': { value: 3 },
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
        'add/add-660e.yaml': { value: 1 },
        'add/add-993e.yaml': { value: 2 },
        'add/add-10bb.yaml': { value: 3 },
        'add/add-7441.yaml': { value: 4 },
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

    const addPersistence = {
        location: 'add',
    };

    expect(add).not.toHaveBeenCalledWith(
        { value: 0 },
        expect.objectContaining(addPersistence)
    );
    expect(add).not.toHaveBeenCalledWith(
        { value: 1 },
        expect.objectContaining(addPersistence)
    );
    expect(add).not.toHaveBeenCalledWith(
        { value: 2 },
        expect.objectContaining(addPersistence)
    );
    expect(add).not.toHaveBeenCalledWith(
        { value: 3 },
        expect.objectContaining(addPersistence)
    );
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

    const addPersistence = {
        location: 'add',
    };

    expect(add).toHaveBeenCalledWith(
        { value: 0 },
        expect.objectContaining(addPersistence)
    );
    expect(add).toHaveBeenCalledWith(
        { value: 2 },
        expect.objectContaining(addPersistence)
    );
    expect(add).toHaveBeenCalledWith(
        { value: 6 },
        expect.objectContaining(addPersistence)
    );

    const multiplyPersistence = {
        location: 'multiply',
    };

    expect(multiply).toHaveBeenCalledWith(
        { value: 1 },
        expect.objectContaining(multiplyPersistence)
    );
    expect(multiply).toHaveBeenCalledWith(
        { value: 3 },
        expect.objectContaining(multiplyPersistence)
    );
    expect(multiply).toHaveBeenCalledWith(
        { value: 7 },
        expect.objectContaining(multiplyPersistence)
    );

    expect(Object.fromEntries(files.entries())).toEqual({
        'add/add-660e.yaml': { value: 1 },
        'multiply/multiply-993e.yaml': { value: 2 },
        'add/add-10bb.yaml': { value: 3 },
        'multiply/multiply-7441.yaml': { value: 6 },
        'add/add-8092.yaml': { value: 7 },
        'multiply/multiply-c76d.yaml': { value: 14 },
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
        'sub-pipe/add/add-51ea.yaml': { value: 5 },
        'sub-pipe/multiply/multiply-b956.yaml': { value: 10 },
        'sub-pipe/sub-pipe-51ea.yaml': { value: 10 },
        'multiply/multiply-26e7.yaml': { value: 20 },
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
        'sub-pipe/add/add-51ea.yaml': { value: 5 },
        'sub-pipe/multiply/multiply-b956.yaml': { value: 10 },
        'sub-pipe/sub-pipe-51ea.yaml': { value: 10 },
        'multiply/multiply-26e7.yaml': { value: 20 },
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
        'sub-pipe/add/add-51ea.yaml': { value: 5 },
        'sub-pipe/multiply/multiply-b956.yaml': { value: 10 },
        'sub-pipe/sub-pipe-51ea.yaml': { value: 10 },
        'multiply/multiply-26e7.yaml': { value: 20 },
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
        'sub-pipe/add/add-51ea.yaml': { value: 5 },
        'sub-pipe/multiply/multiply-b956.yaml': { value: 10 },
        'sub-pipe/sub-pipe-51ea.yaml': { value: 10 },
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
        'sub-pipe/add/add-51ea.yaml': { value: 5 },
        'sub-pipe/multiply/multiply-b956.yaml': { value: 10 },
        'sub-pipe/sub-pipe-51ea.yaml': { value: 10 },
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

it('should clean only on executed levels', async () => {
    const { deps, files } = setup();

    Object.entries({
        'sub-pipe/add/add-51ea.yaml': { value: 5 },
        'sub-pipe/add/add-xxyy.yaml': { value: 5 },
        'sub-pipe/multiply/multiply-b956.yaml': { value: 10 },
        'sub-pipe/multiply/multiply-xxyy.yaml': { value: 5 },
        'sub-pipe/sub-pipe-51ea.yaml': { value: 10 },
        'sub-pipe/sub-pipe-xxxx.yaml': { value: 15 },
        'multiply/multiply-26e7.yaml': { value: 20 },
        'multiply/multiply-xxxx.yaml': { value: 30 },
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

    expect(add).not.toHaveBeenCalled();
    expect(multiply).not.toHaveBeenCalled();

    await pipeParent.clean(persistence);

    /**
     * @note note that files with xxxx hash deleted but not files with xxyy hash
     */
    expect(Object.fromEntries(files.entries())).toEqual({
        'sub-pipe/add/add-51ea.yaml': { value: 5 },
        'sub-pipe/add/add-xxyy.yaml': { value: 5 },
        'sub-pipe/multiply/multiply-b956.yaml': { value: 10 },
        'sub-pipe/multiply/multiply-xxyy.yaml': { value: 5 },
        'sub-pipe/sub-pipe-51ea.yaml': { value: 10 },
        'multiply/multiply-26e7.yaml': { value: 20 },
    });

    files.delete('sub-pipe/sub-pipe-51ea.yaml');

    const newRun = {
        location: persistence.location,
        info: 'new-run',
    };

    add.mockClear();
    multiply.mockClear();

    expect(await pipeParent.transform({ value: 4 }, newRun)).toEqual({
        value: 20,
    });

    expect(add).not.toHaveBeenCalled();
    expect(multiply).not.toHaveBeenCalled();

    await pipeParent.clean(newRun);

    /**
     * @note note that files with xxyy hash deleted now
     */
    expect(Object.fromEntries(files.entries())).toEqual({
        'sub-pipe/add/add-51ea.yaml': { value: 5 },
        'sub-pipe/multiply/multiply-b956.yaml': { value: 10 },
        'sub-pipe/sub-pipe-51ea.yaml': { value: 10 },
        'multiply/multiply-26e7.yaml': { value: 20 },
    });
});

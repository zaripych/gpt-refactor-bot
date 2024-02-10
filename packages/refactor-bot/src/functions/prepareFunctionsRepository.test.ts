import { expect, it } from '@jest/globals';
import { z } from 'zod';

import { makeFunction } from './makeFunction';
import { prepareFunctionsRepository } from './prepareFunctionsRepository';
import { functionsConfigSchema } from './types';

const add = makeFunction({
    name: 'add',
    description: 'add',
    argsSchema: z.object({
        a: z.number(),
        b: z.number(),
    }),
    resultSchema: z.number(),
    implementation: async ({ a, b }) => {
        return Promise.resolve(a + b);
    },
});

const multiply = makeFunction({
    name: 'multiply',
    description: 'multiply',
    argsSchema: z.object({
        a: z.number(),
        b: z.number(),
    }),
    resultSchema: z.number(),
    implementation: async ({ a, b }) => {
        return Promise.resolve(a * b);
    },
});

it('should work for a single function', async () => {
    const repository = await prepareFunctionsRepository({
        functions: [add],
        config: {
            repositoryRoot: '.',
        },
    });

    expect(
        await repository.executeFunction({
            name: 'add',
            arguments: { a: 1, b: 2 },
        })
    ).toEqual(3);
});

it('should work for multiple functions', async () => {
    const repository = await prepareFunctionsRepository({
        functions: [add, multiply],
        config: {
            repositoryRoot: '.',
        },
    });

    expect(
        await repository.executeFunction({
            name: 'add',
            arguments: { a: 1, b: 2 },
        })
    ).toEqual(3);

    expect(
        await repository.executeFunction({
            name: 'multiply',
            arguments: { a: 2, b: 2 },
        })
    ).toEqual(4);
});

it('should not allow functions which are not in the repository', async () => {
    const repository = await prepareFunctionsRepository({
        functions: [add],
        config: {
            repositoryRoot: '.',
        },
    });

    await expect(
        repository.executeFunction({
            name: 'multiply',
            arguments: { a: 1, b: 2 },
        })
    ).rejects.toThrow('Cannot find function "multiply"');
});

it('should allow adding functions', async () => {
    const repository = await prepareFunctionsRepository({
        functions: [add],
        config: {
            repositoryRoot: '.',
        },
    });

    const nextRepository = await repository.addFunctions({
        functions: [multiply],
        config: repository.config,
    });

    expect(
        await nextRepository.executeFunction({
            name: 'multiply',
            arguments: { a: 1, b: 2 },
        })
    ).toEqual(2);
});

it('should not mutate old repository', async () => {
    const repository = await prepareFunctionsRepository({
        functions: [add],
        config: {
            repositoryRoot: '.',
        },
    });

    const nextRepository = await repository.addFunctions({
        functions: [multiply],
        config: repository.config,
    });

    expect(
        await nextRepository.executeFunction({
            name: 'multiply',
            arguments: { a: 1, b: 2 },
        })
    ).toEqual(2);

    await expect(
        repository.executeFunction({
            name: 'multiply',
            arguments: { a: 1, b: 2 },
        })
    ).rejects.toThrow('Cannot find function "multiply"');
});

it('should allow setting allowed functions', async () => {
    const repository = await prepareFunctionsRepository({
        functions: [add, multiply],
        config: {
            repositoryRoot: '.',
        },
    });

    const nextRepository = repository.setAllowedFunctions({
        add: true,
    });

    await expect(
        nextRepository.executeFunction({
            name: 'multiply',
            arguments: { a: 2, b: 2 },
        })
    ).rejects.toThrow('Cannot find function "multiply"');

    expect(
        await repository.executeFunction({
            name: 'multiply',
            arguments: { a: 2, b: 2 },
        })
    ).toEqual(4);

    const anotherRepository = repository.setAllowedFunctions({
        add: true,
        multiply: true,
    });

    expect(
        await anotherRepository.executeFunction({
            name: 'multiply',
            arguments: { a: 2, b: 2 },
        })
    ).toEqual(4);
});

it('should parse and response using messages from GPT apis', async () => {
    const repository = await prepareFunctionsRepository({
        functions: [add, multiply],
        config: {
            repositoryRoot: '.',
        },
    });

    expect(
        await repository.executeGptFunction({
            functionCall: {
                name: 'multiply',
                arguments: JSON.stringify({ a: 2, b: 2 }),
            },
        })
    ).toEqual({
        message: { content: '4', name: 'multiply', role: 'function' },
    });
});

const needsConfig = makeFunction({
    name: 'needsConfig',
    description: 'needsConfig',
    argsSchema: z.object({
        a: z.number(),
        b: z.number(),
    }),
    resultSchema: z.string(),
    functionsConfigSchema: functionsConfigSchema.augment({
        valueToReturn: z.string(),
    }),
    implementation: async (_, { valueToReturn }) => {
        return Promise.resolve(valueToReturn);
    },
});

it('should work for extra smart functions that have extra config options', async () => {
    const repository = await prepareFunctionsRepository({
        functions: [needsConfig],
        config: {
            repositoryRoot: '.',
            valueToReturn: 'hello',
        },
    });

    expect(
        await repository.executeFunction({
            name: 'needsConfig',
            arguments: { a: 1, b: 2 },
        })
    ).toEqual('hello');
});

it('should allow adding extra functions with extra config options', async () => {
    const repository = await prepareFunctionsRepository({
        functions: [add],
        config: {
            repositoryRoot: '.',
        },
    });

    const nextRepository = await repository.addFunctions({
        functions: [needsConfig],
        config: {
            repositoryRoot: '.',
            valueToReturn: 'hello world',
        },
    });

    expect(
        await nextRepository.executeFunction({
            name: 'needsConfig',
            arguments: { a: 1, b: 2 },
        })
    ).toEqual('hello world');
});

> This is a conversation with a OpenAI model. You can edit this file manually to
> enter a new prompt and then execute `pnpm refactor-bot prompt` to continue the
> conversation.

> Messages are separated by a `---`. The application is going to automatically
> add `> @role [user|assistant|system]` to the messages depending on their
> order. Feel free to modify the comment to change the role of a message. All
> quotes are considered comments.

> @role user

Which functions make use of the `makePipelineFunction` function?

---

> @role assistant

```json
{
    "name": "references",
    "arguments": "{\n  \"identifier\": \"makePipelineFunction\"\n}"
}
```

---

> @role function

> @function references

```json
[
    {
        "filePath": "src/pipeline/makePipelineFunction.ts",
        "package": "refactor-bot",
        "references": [
            {
                "pos": 314,
                "line": 9,
                "column": 16,
                "excerpt": "export function makePipelineFunction<"
            }
        ]
    },
    {
        "filePath": "src/refactor/checkoutSandbox.ts",
        "package": "refactor-bot",
        "references": [
            {
                "pos": 930,
                "line": 18,
                "column": 9,
                "excerpt": "import { makePipelineFunction } from '../pipeline/makePipelineFunction';"
            },
            {
                "pos": 2091,
                "line": 58,
                "column": 31,
                "excerpt": "export const checkoutSandbox = makePipelineFunction({"
            }
        ]
    },
    {
        "filePath": "src/refactor/prompt.ts",
        "package": "refactor-bot",
        "references": [
            {
                "pos": 815,
                "line": 23,
                "column": 9,
                "excerpt": "import { makePipelineFunction } from '../pipeline/makePipelineFunction';"
            },
            {
                "pos": 1830,
                "line": 59,
                "column": 13,
                "excerpt": "const chat = makePipelineFunction({"
            },
            {
                "pos": 2803,
                "line": 98,
                "column": 13,
                "excerpt": "const exec = makePipelineFunction({"
            },
            {
                "pos": 5255,
                "line": 182,
                "column": 22,
                "excerpt": "export const prompt = makePipelineFunction({"
            }
        ]
    },
    {
        "filePath": "src/refactor/enrichObjective.ts",
        "package": "refactor-bot",
        "references": [
            {
                "pos": 83,
                "line": 4,
                "column": 9,
                "excerpt": "import { makePipelineFunction } from '../pipeline/makePipelineFunction';"
            },
            {
                "pos": 1973,
                "line": 53,
                "column": 31,
                "excerpt": "export const enrichObjective = makePipelineFunction({"
            }
        ]
    },
    {
        "filePath": "src/refactor/check.ts",
        "package": "refactor-bot",
        "references": [
            {
                "pos": 231,
                "line": 7,
                "column": 9,
                "excerpt": "import { makePipelineFunction } from '../pipeline/makePipelineFunction';"
            },
            {
                "pos": 1292,
                "line": 40,
                "column": 21,
                "excerpt": "export const check = makePipelineFunction({"
            }
        ]
    },
    {
        "filePath": "src/refactor/planFiles.ts",
        "package": "refactor-bot",
        "references": [
            {
                "pos": 293,
                "line": 9,
                "column": 9,
                "excerpt": "import { makePipelineFunction } from '../pipeline/makePipelineFunction';"
            },
            {
                "pos": 4188,
                "line": 117,
                "column": 25,
                "excerpt": "export const planFiles = makePipelineFunction({"
            }
        ]
    },
    {
        "filePath": "src/refactor/edit.ts",
        "package": "refactor-bot",
        "references": [
            {
                "pos": 258,
                "line": 8,
                "column": 9,
                "excerpt": "import { makePipelineFunction } from '../pipeline/makePipelineFunction';"
            },
            {
                "pos": 2908,
                "line": 83,
                "column": 20,
                "excerpt": "export const edit = makePipelineFunction({"
            }
        ]
    },
    {
        "filePath": "src/refactor/refactorFile.ts",
        "package": "refactor-bot",
        "references": [
            {
                "pos": 636,
                "line": 15,
                "column": 9,
                "excerpt": "import { makePipelineFunction } from '../pipeline/makePipelineFunction';"
            },
            {
                "pos": 4966,
                "line": 158,
                "column": 28,
                "excerpt": "export const refactorFile = makePipelineFunction({"
            }
        ]
    },
    {
        "filePath": "src/refactor/refactorBatch.ts",
        "package": "refactor-bot",
        "references": [
            {
                "pos": 374,
                "line": 9,
                "column": 9,
                "excerpt": "import { makePipelineFunction } from '../pipeline/makePipelineFunction';"
            },
            {
                "pos": 1560,
                "line": 47,
                "column": 29,
                "excerpt": "export const refactorBatch = makePipelineFunction({"
            }
        ]
    },
    {
        "filePath": "src/refactor/refactorObjective.ts",
        "package": "refactor-bot",
        "references": [
            {
                "pos": 144,
                "line": 5,
                "column": 9,
                "excerpt": "import { makePipelineFunction } from '../pipeline/makePipelineFunction';"
            },
            {
                "pos": 753,
                "line": 23,
                "column": 31,
                "excerpt": "export const planAndRefactor = makePipelineFunction({"
            }
        ]
    },
    {
        "filePath": "src/refactor/refactorGoal.ts",
        "package": "refactor-bot",
        "references": [
            {
                "pos": 378,
                "line": 9,
                "column": 9,
                "excerpt": "import { makePipelineFunction } from '../pipeline/makePipelineFunction';"
            },
            {
                "pos": 1559,
                "line": 43,
                "column": 28,
                "excerpt": "export const refactorGoal = makePipelineFunction({"
            }
        ]
    },
    {
        "filePath": "src/pipeline/pipeline.test.ts",
        "package": "refactor-bot",
        "references": [
            {
                "pos": 383,
                "line": 10,
                "column": 9,
                "excerpt": "import { makePipelineFunction } from './makePipelineFunction';"
            },
            {
                "pos": 26511,
                "line": 873,
                "column": 22,
                "excerpt": "const subPipeFn = makePipelineFunction({"
            },
            {
                "pos": 28955,
                "line": 951,
                "column": 18,
                "excerpt": "const addFn = makePipelineFunction("
            },
            {
                "pos": 29212,
                "line": 961,
                "column": 23,
                "excerpt": "const multiplyFn = makePipelineFunction("
            },
            {
                "pos": 29478,
                "line": 971,
                "column": 22,
                "excerpt": "const subPipeFn = makePipelineFunction("
            },
            {
                "pos": 31192,
                "line": 1032,
                "column": 18,
                "excerpt": "const addFn = makePipelineFunction("
            },
            {
                "pos": 31449,
                "line": 1042,
                "column": 23,
                "excerpt": "const multiplyFn = makePipelineFunction("
            },
            {
                "pos": 31715,
                "line": 1052,
                "column": 22,
                "excerpt": "const subPipeFn = makePipelineFunction("
            },
            {
                "pos": 35314,
                "line": 1175,
                "column": 18,
                "excerpt": "const addFn = makePipelineFunction("
            },
            {
                "pos": 35571,
                "line": 1185,
                "column": 23,
                "excerpt": "const multiplyFn = makePipelineFunction("
            },
            {
                "pos": 35837,
                "line": 1195,
                "column": 22,
                "excerpt": "const subPipeFn = makePipelineFunction("
            },
            {
                "pos": 38578,
                "line": 1286,
                "column": 18,
                "excerpt": "const addFn = makePipelineFunction("
            },
            {
                "pos": 38835,
                "line": 1296,
                "column": 23,
                "excerpt": "const multiplyFn = makePipelineFunction("
            },
            {
                "pos": 39108,
                "line": 1306,
                "column": 23,
                "excerpt": "const testPipeFn = makePipelineFunction("
            }
        ]
    },
    {
        "filePath": "src/refactor/planTasks.ts",
        "package": "refactor-bot",
        "references": [
            {
                "pos": 204,
                "line": 7,
                "column": 9,
                "excerpt": "import { makePipelineFunction } from '../pipeline/makePipelineFunction';"
            },
            {
                "pos": 3820,
                "line": 126,
                "column": 25,
                "excerpt": "export const planTasks = makePipelineFunction({"
            }
        ]
    }
]
```

---

> @role assistant

The following functions make use of the `makePipelineFunction` function:

1. `checkoutSandbox` in the file `src/refactor/checkoutSandbox.ts`
2. `prompt` in the file `src/refactor/prompt.ts`
3. `enrichObjective` in the file `src/refactor/enrichObjective.ts`
4. `check` in the file `src/refactor/check.ts`
5. `planFiles` in the file `src/refactor/planFiles.ts`
6. `edit` in the file `src/refactor/edit.ts`
7. `refactorFile` in the file `src/refactor/refactorFile.ts`
8. `refactorBatch` in the file `src/refactor/refactorBatch.ts`
9. `planAndRefactor` in the file `src/refactor/refactorObjective.ts`
10. `refactorGoal` in the file `src/refactor/refactorGoal.ts`
11. Various functions in the file `src/pipeline/pipeline.test.ts`
12. `planTasks` in the file `src/refactor/planTasks.ts`

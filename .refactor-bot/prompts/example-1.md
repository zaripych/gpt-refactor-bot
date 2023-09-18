> This is a conversation with a OpenAI model. You can edit this file manually to enter a new prompt and then execute `pnpm refactor-bot prompt` to continue the conversation.

> Messages are separated by a `---`. The application is going to automatically add `> @role [user|assistant|system]` to the messages depending on their order. Feel free to modify the comment to change the role of a message. All quotes are considered comments.

> @role user

Can you list me all sub-classes of the `AbortError` class?

---

> @role assistant

```json
{
    "name": "declarations",
    "arguments": "{\n  \"identifier\": \"AbortError\",\n  \"identifierContext\": \"class\"\n}"
}
```

---

> @role function

> @function declarations

```json
[
    {
        "filePath": "src/errors/abortError.ts",
        "declaration": "export class AbortError extends Error {\n    override name = 'AbortError';\n\n    constructor(\n        message: string,\n        options?: ErrorOptions & Record<string, unknown>\n    ) {\n        super(message, options);\n        Object.assign(this, options);\n    }\n}",
        "info": "class AbortError"
    }
]
```

---

> @role assistant

```json
{
    "name": "references",
    "arguments": "{\n  \"identifier\": \"AbortError\",\n  \"identifierContext\": \"class\"\n}"
}
```

---

> @role function

> @function references

```json
[
    {
        "filePath": "src/errors/abortError.ts",
        "package": "refactor-bot",
        "references": [
            {
                "pos": 12,
                "line": 1,
                "column": 13,
                "excerpt": "export class AbortError extends Error {"
            }
        ]
    },
    {
        "filePath": "src/errors/configurationError.ts",
        "package": "refactor-bot",
        "references": [
            {
                "pos": 8,
                "line": 1,
                "column": 9,
                "excerpt": "import { AbortError } from './abortError';"
            },
            {
                "pos": 83,
                "line": 3,
                "column": 40,
                "excerpt": "export class ConfigurationError extends AbortError {"
            }
        ]
    },
    {
        "filePath": "src/errors/outOfContextBoundsError.ts",
        "package": "refactor-bot",
        "references": [
            {
                "pos": 8,
                "line": 1,
                "column": 9,
                "excerpt": "import { AbortError } from './abortError';"
            },
            {
                "pos": 88,
                "line": 3,
                "column": 45,
                "excerpt": "export class OutOfContextBoundsError extends AbortError {"
            }
        ]
    },
    {
        "filePath": "src/errors/rateLimitExceeded.ts",
        "package": "refactor-bot",
        "references": [
            {
                "pos": 8,
                "line": 1,
                "column": 9,
                "excerpt": "import { AbortError } from './abortError';"
            },
            {
                "pos": 87,
                "line": 3,
                "column": 44,
                "excerpt": "export class RateLimitExceededError extends AbortError {"
            }
        ]
    },
    {
        "filePath": "src/errors/cycleDetectedError.ts",
        "package": "refactor-bot",
        "references": [
            {
                "pos": 8,
                "line": 1,
                "column": 9,
                "excerpt": "import { AbortError } from './abortError';"
            },
            {
                "pos": 83,
                "line": 3,
                "column": 40,
                "excerpt": "export class CycleDetectedError extends AbortError {"
            }
        ]
    },
    {
        "filePath": "src/utils/retry.ts",
        "package": "refactor-bot",
        "references": [
            {
                "pos": 8,
                "line": 1,
                "column": 9,
                "excerpt": "import { AbortError } from '../errors/abortError';"
            },
            {
                "pos": 605,
                "line": 21,
                "column": 31,
                "excerpt": "if (err instanceof AbortError) {"
            }
        ]
    },
    {
        "filePath": "src/pipeline/pipeline.ts",
        "package": "refactor-bot",
        "references": [
            {
                "pos": 231,
                "line": 7,
                "column": 9,
                "excerpt": "import { AbortError } from '../errors/abortError';"
            },
            {
                "pos": 13255,
                "line": 428,
                "column": 26,
                "excerpt": "throw new AbortError("
            },
            {
                "pos": 18890,
                "line": 613,
                "column": 26,
                "excerpt": "throw new AbortError(`Pipeline has been aborted`);"
            }
        ]
    },
    {
        "filePath": "src/refactor/refactorFile.ts",
        "package": "refactor-bot",
        "references": [
            {
                "pos": 183,
                "line": 7,
                "column": 9,
                "excerpt": "import { AbortError } from '../errors/abortError';"
            },
            {
                "pos": 6205,
                "line": 194,
                "column": 22,
                "excerpt": "throw new AbortError("
            },
            {
                "pos": 19978,
                "line": 504,
                "column": 38,
                "excerpt": "throw new AbortError("
            }
        ]
    },
    {
        "filePath": "src/refactor/refactorBatch.ts",
        "package": "refactor-bot",
        "references": [
            {
                "pos": 34,
                "line": 3,
                "column": 9,
                "excerpt": "import { AbortError } from '../errors/abortError';"
            },
            {
                "pos": 2703,
                "line": 81,
                "column": 39,
                "excerpt": "err instanceof AbortError"
            }
        ]
    }
]
```

---

> @role assistant

The `AbortError` class has the following sub-classes:

1. `ConfigurationError` (defined in `src/errors/configurationError.ts`)
2. `OutOfContextBoundsError` (defined in `src/errors/outOfContextBoundsError.ts`)
3. `RateLimitExceededError` (defined in `src/errors/rateLimitExceeded.ts`)
4. `CycleDetectedError` (defined in `src/errors/cycleDetectedError.ts`)

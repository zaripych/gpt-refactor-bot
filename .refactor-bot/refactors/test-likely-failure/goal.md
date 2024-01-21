```yaml
# This is to test a likely failure during refactor
ref: 8f1a3da55caeee3df75853042e57978c45513f18
budgetCents: 100
model: gpt-3.5-turbo-1106
```

Replace all usages of `readFile` from `fs/promises` module with `readFileSync`
from `fs` module in `packages/refactor-bot/src/cache/dependencies.ts`.

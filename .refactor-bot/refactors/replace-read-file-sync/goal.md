```yaml
# For information about possible options have a look at the code:
# https://github.com/zaripych/refactor-bot/blob/9b928d601a7586cd1adf20dbeb406625a0d7663f/src/refactor/types.ts#L11
ref: 8f1a3da55caeee3df75853042e57978c45513f18
budgetCents: 100
model: gpt-4-1106-preview
```

Replace all usages of `readFile` from `fs/promises` module with `readFileSync`
from `fs` module.

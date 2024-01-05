```yaml
# For information about possible options have a look at the code:
# https://github.com/zaripych/refactor-bot/blob/438ef72319a914aa55bd1f9bba2523de7aba0b88/packages/refactor-bot/src/refactor/types.ts#L7
ref: 8f1a3da55caeee3df75853042e57978c45513f18
budgetCents: 100
model: gpt-4-1106-preview
```

Replace all usages of `readFile` from `fs/promises` module with `readFileSync`
from `fs` module.

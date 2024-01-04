```yaml
# For information about possible options have a look at the code:
# https://github.com/zaripych/refactor-bot/blob/9b928d601a7586cd1adf20dbeb406625a0d7663f/src/refactor/types.ts#L11
ref: c361a51b7654d2753f62cc6ea4c12fb95c63d9ce
budgetCents: 100
model: gpt-4-1106-preview
```

Replace all usages of `readFile` from `fs/promises` module with `readFileSync`
from `fs` module.

```yaml
# For information about possible options have a look at the code:
# https://github.com/zaripych/refactor-bot/blob/9b928d601a7586cd1adf20dbeb406625a0d7663f/src/refactor/types.ts#L11
ref: 9cc1d4e0e5e661f7f49873f337320724a29f2345
budgetCents: 100
model: gpt-4
```

Replace all usages of `readFile` from `fs/promises` module with `readFileSync` from `fs` module.

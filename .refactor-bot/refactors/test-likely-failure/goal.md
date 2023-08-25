```yaml
# This is to test a likely failure during refactor
ref: 5106cc1bc2411959cf784967564199e862bbb2e0
budgetCents: 100
model: gpt-3.5-turbo
```

Replace all usages of `readFile` from `fs/promises` module with `readFileSync` from `fs` module in `src/pipeline/dependencies.ts`.

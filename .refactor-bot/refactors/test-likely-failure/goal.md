```yaml
# This is to test a likely failure during refactor
ref: c361a51b7654d2753f62cc6ea4c12fb95c63d9ce
budgetCents: 100
model: gpt-3.5-turbo
```

Replace all usages of `readFile` from `fs/promises` module with `readFileSync`
from `fs` module in `packages/refactor-bot/src/pipeline/dependencies.ts`.

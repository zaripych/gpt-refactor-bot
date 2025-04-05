```yaml
# This is to test a likely failure during refactor
ref: 8f1a3da55caeee3df75853042e57978c45513f18
model: anthropic:claude-3-7-sonnet-latest
```

Replace all usages of `readFile` from `fs/promises` module with `readFileSync`
from `fs` module in `packages/refactor-bot/src/refactor/planTasks.ts`,
`packages/refactor-bot/src/refactor/loadRefactors.ts` and
`packages/refactor-bot/src/refactor/discoverDependencies.ts`.

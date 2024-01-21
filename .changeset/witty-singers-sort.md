---
'refactor-bot': patch
---

feat: evaluate refactor outcomes using LLM to make decision of whether file edit
should be accepted or discarded

This is a big change which adds extra steps to the refactor process. Every time
an LLM produces a file edit - we will pass that edit through evaluation
algorithm to asses whether it should be accepted or discarded. Previously, this
logic was only affected by the existence or absence of eslint errors. This will
make the final result higher quality and more reliable.

The new behavior can be disabled by setting `evaluate: false` in the `goal.md`
file.

In addition to that, this change also adds a new CLI command for internal use
which allows us to compare results of multiple refactor runs. This is useful for
benchmarking purposes.

To run the benchmark, use the following command:

```sh
pnpm benchmark --config .refactor-bot/benchmarks/test-benchmark.yaml
```

Where the config:

```yaml
refactorConfig:
    name: test-refactoring
    ref: 8f1a3da55caeee3df75853042e57978c45513f18
    budgetCents: 100
    model: gpt-4-1106-preview
    objective:
        Replace all usages of `readFile` from `fs/promises` module with
        `readFileSync` from `fs` module in
        `packages/refactor-bot/src/refactor/planTasks.ts`,
        `packages/refactor-bot/src/refactor/loadRefactors.ts` and
        `packages/refactor-bot/src/refactor/discoverDependencies.ts`.

numberOfRuns: 2

variants:
    - name: 'A'
      ids: # ids of refactor runs to save mooney on
          - VRixXEwC
          - k0FmgQjU
          - IpSOtP7d
          - xqydSrSU
    - name: 'B'
```

This will run multiple refactor runs and compare the results. At this moment no
statistical analysis is performed as I'm not convinced we can reach statistical
significance with the number of runs that also doesn't make you poor.

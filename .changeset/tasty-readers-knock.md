---
'refactor-bot': patch
---

feat: introducing experimental chunky edit strategy

This strategy allows the LLM to perform edits via find-replace operations which
reduce the total number of completion tokens. The completion tokens are
typically priced at twice the cost of prompt tokens. In addition to the
reduction of the price this strategy also significantly improves the performance
of the refactoring.

Here are benchmark results for the `chunky-edit` strategy:

```sh
           METRIC         │     A     │     B     │  DIFF
  ────────────────────────┼───────────┼───────────┼──────────
    numberOfRuns          │      9.00 │     10.00 │
    score                 │      0.83 │      1.00 │ +17.28%
    acceptedRatio         │      0.81 │      1.00 │ +18.52%
    totalTokens           │  44688.67 │  50365.90 │ +12.70%
    totalPromptTokens     │  40015.44 │  48283.30 │ +20.66%
    totalCompletionTokens │   4673.22 │   2082.60 │ -55.44%
    wastedTokensRatio     │      0.09 │      0.00 │ -9.49%
    durationMs            │ 286141.39 │ 171294.32 │ -40.14%
```

While it does seem to improve the score, this should just be considered as
variance introduce by the randomness of the LLM. The main outcome of this
strategy is the reduction of the number of completion tokens and the improvement
of the performance.

There might be some other side effects, probably depending on the type of the
refactor. So, this strategy is still experimental and must be selectively
opted-in via "--experiment-chunky-edit-strategy" cli option.

---
'refactor-bot': patch
---

feat: this one introduces a feature which allows refactor-bot to perform
aggregation and other more advanced analytics in the codebase

We ask the model to generate a script for us that can use `ts-morph` directly
and execute map/reduce in the repository. The script is ran in a separate
process for a bit of safety and can also be moved to a Docker container.

---
'refactor-bot': patch
---

fix: fail if eslint is not properly configured or installed instead of ignoring
the errors

If eslint is not properly configured or installed, the refactor bot would ignore
the errors because it would fail to analyze `stderr` of the `eslint` command.

It now properly fails with a message that explains the problem.

This should lead to better outcomes when configuring the refactor bot for the
first time.

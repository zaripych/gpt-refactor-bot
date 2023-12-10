---
'refactor-bot': patch
---

fix: module imports function is now smarter and doesn't include results from
in-repo modules that import themselves

This should ensure that when we _ are looking for imports of "package" where the
"package" _ is one of the monorepo packages - we do not include itself importing
its own internal files.

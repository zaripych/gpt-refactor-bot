---
'refactor-bot': patch
---

fix: introduced a parameter which allows us to control how TypeScript projects
are loaded in monorepo scenarios

Ie if `useCombinedTsMorphProject` is `true` then the original strategy is used -
where we load all TypeScript projects into a single ts-morph `Project`. This
allows cross-project references to be easily found and traced. The disadvantage
of this approach is that it might not just work if projects settings are
different.

---
'refactor-bot': patch
---

refactor: the caching layer of the refactor bot now supports events

The events make it easier for separation of concerns between modules.

For example, it now allows us to collect refactor results from multiple layers
of code without having to pass around mutable references.

This also allows us to measure the performance of the refactor bot and calculate
the costs associated with OpenAI api.

All of this to prepare for the refactor bot to have automatically evaluate
itself and setup benchmarks that could be used to further measure and improve
it's performance.

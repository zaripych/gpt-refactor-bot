# refactor-bot

## 0.0.2

### Patch Changes

-   [#12](https://github.com/zaripych/gpt-refactor-bot/pull/12) [`9131738`](https://github.com/zaripych/gpt-refactor-bot/commit/9131738de755f931fb02b21167bd500ff5ecf05c) Thanks [@zaripych](https://github.com/zaripych)! - fix: sanitize results of the function calls when they fail removing full paths to repository

-   [#12](https://github.com/zaripych/gpt-refactor-bot/pull/12) [`9131738`](https://github.com/zaripych/gpt-refactor-bot/commit/9131738de755f931fb02b21167bd500ff5ecf05c) Thanks [@zaripych](https://github.com/zaripych)! - fix: default to gpt-3.5-turbo-1106 in the config

-   [#12](https://github.com/zaripych/gpt-refactor-bot/pull/12) [`9131738`](https://github.com/zaripych/gpt-refactor-bot/commit/9131738de755f931fb02b21167bd500ff5ecf05c) Thanks [@zaripych](https://github.com/zaripych)! - fix: fail at the start of the refactor when prettier cannot be found

## 0.0.1

### Patch Changes

-   [`1666830`](https://github.com/zaripych/gpt-refactor-bot/commit/1666830c524a80f8811d6f55bc643420f28368b4) Thanks [@zaripych](https://github.com/zaripych)! - docs: updated the README.md to make them compatible with npm

## 0.0.0

### Patch Changes

-   [#7](https://github.com/zaripych/gpt-refactor-bot/pull/7) [`5caf325`](https://github.com/zaripych/gpt-refactor-bot/commit/5caf325099513b5dbe58d1fcc8b61bb060be5e14) Thanks [@zaripych](https://github.com/zaripych)! - fix: prevent pnpm from asking questions when install command is run

-   [#6](https://github.com/zaripych/gpt-refactor-bot/pull/6) [`b7ba5a3`](https://github.com/zaripych/gpt-refactor-bot/commit/b7ba5a375fb62cae6ce95ef1f8848694688c9a84) Thanks [@zaripych](https://github.com/zaripych)! - feat: this one introduces a feature which allows refactor-bot to perform aggregation and other more advanced analytics in the codebase

    We ask the model to generate a script for us that can use `ts-morph` directly and execute map/reduce in the repository. The script is ran in a separate process for a bit of safety and can also be moved to a Docker container.

-   [#8](https://github.com/zaripych/gpt-refactor-bot/pull/8) [`438ef72`](https://github.com/zaripych/gpt-refactor-bot/commit/438ef72319a914aa55bd1f9bba2523de7aba0b88) Thanks [@zaripych](https://github.com/zaripych)! - refactor: the caching layer of the refactor bot now supports events

    The events make it easier for separation of concerns between modules.

    For example, it now allows us to collect refactor results from multiple layers of code without having to pass around mutable references.

    This also allows us to measure the performance of the refactor bot and calculate the costs associated with OpenAI api.

    All of this to prepare for the refactor bot to have automatically evaluate itself and setup benchmarks that could be used to further measure and improve it's performance.

-   [#2](https://github.com/zaripych/gpt-refactor-bot/pull/2) [`2d7df8e`](https://github.com/zaripych/gpt-refactor-bot/commit/2d7df8e8d8aa66d3e3817e3865baee87556c2c70) Thanks [@zaripych](https://github.com/zaripych)! - fix: sanitised result of the functions to exclude user's repository path from the output of the functions

-   [#2](https://github.com/zaripych/gpt-refactor-bot/pull/2) [`b04ab6b`](https://github.com/zaripych/gpt-refactor-bot/commit/b04ab6bd8a6514ac41274b6eddfd54a34d61e5fb) Thanks [@zaripych](https://github.com/zaripych)! - fix: introduced a parameter which allows us to control how TypeScript projects are loaded in monorepo scenarios

    Ie if `useCombinedTsMorphProject` is `true` then the original strategy is used - where we load all TypeScript projects into a single ts-morph `Project`. This allows cross-project references to be easily found and traced. The disadvantage of this approach is that it might not just work if projects settings are different.

-   [#7](https://github.com/zaripych/gpt-refactor-bot/pull/7) [`5caf325`](https://github.com/zaripych/gpt-refactor-bot/commit/5caf325099513b5dbe58d1fcc8b61bb060be5e14) Thanks [@zaripych](https://github.com/zaripych)! - fix: format function would leave one variable unformatted when it is preceeded with an empty string

-   [#7](https://github.com/zaripych/gpt-refactor-bot/pull/7) [`5caf325`](https://github.com/zaripych/gpt-refactor-bot/commit/5caf325099513b5dbe58d1fcc8b61bb060be5e14) Thanks [@zaripych](https://github.com/zaripych)! - fix: the references function would return empty array when includeFilePaths parameter is used for a node built-in

-   [#3](https://github.com/zaripych/gpt-refactor-bot/pull/3) [`401d3b5`](https://github.com/zaripych/gpt-refactor-bot/commit/401d3b5a7094d614386cfe8213df4bc03b913f45) Thanks [@zaripych](https://github.com/zaripych)! - fix: the package manager not being determined correctly if "packageManager" field is specified in the package.json

-   [#4](https://github.com/zaripych/gpt-refactor-bot/pull/4) [`ef77b8d`](https://github.com/zaripych/gpt-refactor-bot/commit/ef77b8dea6125709d6faea03c3225f8dcd6fbd90) Thanks [@zaripych](https://github.com/zaripych)! - fix: formatting going to infinite cycle if the values contain placeholders

-   [#2](https://github.com/zaripych/gpt-refactor-bot/pull/2) [`b65fe19`](https://github.com/zaripych/gpt-refactor-bot/commit/b65fe194762509efa23687bce46f086a5d5740ab) Thanks [@zaripych](https://github.com/zaripych)! - fix: module imports function is now smarter and doesn't include results from in-repo modules that import themselves

    This should ensure that when we _ are looking for imports of "package" where the "package" _ is one of the monorepo packages - we do not include itself importing its own internal files.

-   [#2](https://github.com/zaripych/gpt-refactor-bot/pull/2) [`b04ab6b`](https://github.com/zaripych/gpt-refactor-bot/commit/b04ab6bd8a6514ac41274b6eddfd54a34d61e5fb) Thanks [@zaripych](https://github.com/zaripych)! - fix: added new GPT4 models to the list of possible choices

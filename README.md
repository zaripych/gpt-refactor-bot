# refactor-bot

`refactor-bot` is a CLI for automated code refactoring using OpenAI's LLMs.

Based on the goal provided by the user the CLI will use the OpenAI API to
generate a plan for the refactoring, and refactor one file at a time using "Plan
and Execute" technique, at the same time making sure the code still compiles and
passes linting and tests.

The difference between `refactor-bot` and other tools is that it provides rich
functions API based on `ts-morph` that allows it to extract TypeScript specific
information from the codebase. This deeper insight into the codebase allows the
CLI to perform more complex refactoring tasks that span across multiple files.

# Installation

```
pnpm add refactor-bot
```

## From source

Don't you want to tinker with the code yourself? Off-course you do. Then you can
install the CLI from source, and it should be quite easy to do so - no build
process is required. It will just run TypeScript.

```
git clone git@github.com:zaripych/gpt-refactor-bot.git
```

```
# Install refactor-bot dependencies
pnpm install

# Switch back to your project's repository and add refactor-bot as a dependency
cd ../your-project-repository pnpm add --save-dev
file://../refactor-bot/packages/refactor-bot

# Use `tsx` to run refactor-bot TypeScript code directly without building it
pnpm add tsx

# Run the CLI:
pnpm refactor-bot --help
```

# Run the CLI:

```
pnpm refactor-bot --help
```

Create `.env` file in current directory:

```
OPENAI_API_KEY="your-key"
```

Supports commands at the moment:

```sh
pnpm refactor-bot <command>

Commands:
  pnpm refactor-bot prompt      Sends a prompt to the ChatGPT API to generate a
                                response
  pnpm refactor-bot refactor    Performs a refactoring using Plan and Execute te
                                chnique
  pnpm refactor-bot completion  generate completion script

Options:
  --help     Show help                                                 [boolean]
  --version  Show version number                                       [boolean]
```

## Refactor

```sh
➜  pnpm refactor-bot refactor

Performs a refactoring using Plan and Execute technique

Options:
  --help     Show help                                                 [boolean]
  --version  Show version number                                       [boolean]
  --name     Name of the refactoring to run                             [string]
  --id       Unique id of the refactoring that was previously run but didn't fin
             ish to start from last successful point                    [string]
```

At first it will create a file for you with description of the refactor. Open
the file, edit it in your editor providing as much relevant information as you
think is needed, then rerun the command.

For an example,
[have a look here](https://github.com/zaripych/gpt-refactor-bot/blob/main/.refactor-bot/refactors/replace-read-file-sync/goal.md?plain=1#L9).

After creating the `goal` description file, we can run the CLI again with the
name of the file to start the process.

```sh
pnpm refactor-bot refactor --name xx-yy-zz
```

Refactoring is considered a success if none of the changed files lead to
TypeScript or eslint issues and all affected tests pass. Changes which fail the
checks will be reverted.

After refactoring is complete, you will be presented with a report.

Refactoring will not change any files in your local repository and you will be
asked to merge the changes yourself.

At the moment the refactoring is performed in a way that doesn't allow module
interface to change. This means that the type that represents all exported
members of a file will not change as a result of the refactoring. This is done
to ensure that the refactoring is not going to break the codebase. This is
likely the most valuable use case, as it is more likely to result in a success.
Other options are being considered.

It's likely refactoring might fail for one reason or the other. This could
happen for following reasons:

-   Pre-requisites and expectations about the repository are not met by the CLI,
    see expectations section below
-   The OpenAI model is not capable of performing the refactoring either due to
    the model limitations or lack of proper description
-   There is a bug in the refactor-bot

In any case, the CLI was built in a way that it can reproduce all the successful
steps it had done during previous run without starting from scratch, as long as
we know the "refactor-run-id". So if you run the CLI again with the same `--id`
it will start from the last successful step.

Use `LOG_LEVEL=debug` environment variable to see more information about what's
happening.

![Example output](https://media.githubusercontent.com/media/zaripych/gpt-refactor-bot/main/.refactor-bot/refactors/replace-read-file-sync/example-report.png 'Example output')

For more information about how refactoring works see
[./DOCUMENTATION.md](https://github.com/zaripych/gpt-refactor-bot/blob/main/DOCUMENTATION.md).

## Expectations

-   Source code is TypeScript
-   `git` for version control
-   `prettier` for code formatting
-   `VSCode` as editor (optional)
-   You have `glow` installed and available in your `PATH` for formatting
    `markdown` in terminals (optional)

## Prompt

The `prompt` command allows you to test the functions API we provide to the
ChatGPT and see what kind of information it can extract from the codebase.

```sh
➜  pnpm refactor-bot prompt --watch
? Select a file where the conversation is going to be stored › - Use arrow-keys. Return to submit.
❯   example-1
    example-2
    New conversation...
```

Select a file, and then you will be prompted to enter a message using your
editor. Save the message with `---` at the end to send it.

See example conversation at
[`.refactor-bot/prompts/example-1.md`](https://github.com/zaripych/gpt-refactor-bot/blob/main/.refactor-bot/prompts/example-1.md).

## Roadmap

The `refactor` command can do a lot of interesting things. It can be improved
further, but there is no way to measure how much we improved it. So the next
step is to add a way to measure the quality of the refactor for benchmarking
purposes.

-   [ ] ability to evaluate result of the refactor to benchmark the quality of
        the refactor, so we can asses how different changes affect the quality
        and performance of the refactor-bot
-   [ ] add Chain Of Thoughts to try to recover from failed attempts to fix
        issues/tests. at the moment, the algorithm might spent some time in a
        rabbit hole trying to fix eslint issues for changes it could have
        reverted in the first place
-   [ ] add evaluation of multiple responses - at the moment we already can
        introduce extra iterations to the algorithm, so that instead of
        analyzing just one response from the LLM, we can try to get multiple and
        assess if one is better than the other - which can be done by running
        eslint and tsc on the code generated by the LLM
-   [ ] add self-verification of the refactor-bot - ie it could try to
        self-reflect if the results produced by the LLM is good enough and
        attempt to self-review and try to produce a better output/outcome
-   [ ] add Tree of Thoughts - we can combine self-assessment capabilities with
        the ability to generate multiple responses from the LLM to create a
        tree-like structure of possible outcomes and then evaluate each of them
        to find the best path forward
-   [ ] make the algorithm more flexible and allow refactoring process to change
        the codebase in a way that is not limited to the current module
        interface
-   [ ] spike for an ability to generate a refactor script by LLM which could be
        purposefully built and fine-tuned for a particular task - this would
        allow to perform more complex refactoring tasks with higher level task
        descriptions - ie "migrate RxJS from version 6 to version 7" or "migrate
        to Next.js", etc.
-   [ ] spike for an ability to debug the code - ie it could then run the users
        code in a sandbox and answer questions about the behavior of the code
-   [ ] spike for an ability to generate new code - for example unit tests, or
        new features
-   [ ] spike for an ability to review the code in a PR and possibly debug some
        of it, if it looks sketchy, or suggest improvements (which it would have
        already tested, linted and debugged for you)
-   [ ] ability to create pull requests in GitHub for both successful
        refactoring and discarded commits with issues

## Privacy and Security

If you are concerned about privacy, consider using "business" account with
OpenAI. Read their license agreement to understand how they can use the data we
send there.

The use of the provided tools here is fully at your own risk. Ensure there are
no secrets available to the bot in your projects directory or in environment
variables so nothing can be leaked accidentally.

Just a minimum precautions have been made so far to safeguard from accidental
leaks:

-   We create a temporary directory in `$TMPDIR` and run all the code against
    the copy, the code is copied from your current repository ignoring
    everything from '.gitignore' file so only the source code should be copied
    over
-   We ensure there are no symlinks leading outside of the temporary directory

### How a leak could occur in theory?

We use `ts-morph` to get access to the source code, which uses `TypeScript`
compiler, which can read files in the repository. So if your source code has any
secrets directly in code - they might end up being sent to OpenAI API.

### Code interpreter

The library has capability to run custom code generated by LLM's. At this moment
it is only allowed to write TypeScript scripts, which are validated by rollup
bundling procedure and allowed to access only `ts-morph` library. The use case
for the interpreter is to allow the LLM to generate code which can perform
advanced analytics or aggregation using `ts-morph` API. For an example, see
[`.refactor-bot/prompts/example-5.md`](https://github.com/zaripych/gpt-refactor-bot/blob/main/.refactor-bot/prompts/example-5.md).

This capability is experimental and not exposed to the `refactor` command, but
is available when `prompt` command is used.

### Other external services

We do not use other external services at the moment other than OpenAI API.

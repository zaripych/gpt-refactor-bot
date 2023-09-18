# refactor-bot

Refactor your TypeScript codebase using OpenAI ChatGPT models. This CLI gives
access to your codebase to the OpenAI API, which will then accomplish
refactoring tasks using "Plan and Execute" techniques.

## Installation

```
git clone git@github.com:zaripych/refactor-bot.git
```

```
pnpm install
cd /path/to/your/project
pnpm add /path/to/refactor-bot
pnpm add tsx                    # <- at the moment tsx is required for running TypeScript directly, we can tsc/bundle the refactor-bot later, if it works
pnpm refactor-bot --help
```

## Usage

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

## Prompt

The `prompt` command allows you to test the functions API we provide to the
ChatGPT.

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
[`.refactor-bot/prompts/example-1.md`](.refactor-bot/prompts/example-1.md).

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

At first it will create a file for you with description of the refactor. Open the file, edit it in your editor providing as much relevant information as you think is needed, then rerun the command.

For an example, [have a look here](https://github.com/zaripych/refactor-bot/blob/5374a8381edb5b7adb431ff4847f826872221756/.refactor-bot/refactors/replace-read-file-sync/goal.md#L9).

Here are steps that the CLI takes to execute the refactor:

1. Load the refactor goal and extra parameters from the .md file we created
2. Create a sandbox in `$TMPDIR`, it will copy your project (current directory) to a sandbox location
3. Checkout the start commit, if specified ([`ref`](https://github.com/zaripych/refactor-bot/blob/5374a8381edb5b7adb431ff4847f826872221756/src/refactor/types.ts#L32)), or commit any changes on top of current `HEAD`
4. Enrich the refactor goal with extra information obtained by functions we execute against the code.
5. Create a list of files that require refactoring based on the goal.
6. Follow the plan and refactor every file one by one.
7. Repeat the planning phase until the OpenAI model says we are done.

Internally, it's a little bit more complex, documentation on that is coming soon.

It's more than likely refactoring might fail for one reason or the other. This could happen for following reasons:

-   Pre-requisites and expectations about the repository are not met by the CLI, see expectations section below
-   The OpenAI model is not capable of performing the refactoring either due to the model limitations or lack of proper description, or even possibly too much description
-   There is a bug in the refactor-bot

In any case, the CLI was built in a way that it can reproduce all the successful steps it had done during previous run without starting from scratch, as long as we know the "refactor-run-id". So if you run the CLI again with the same `--name` and `--id` it will start from the last successful step.

Use `LOG_LEVEL=debug` environment variable to see more information about what's happening.

![Example output](.refactor-bot/refactors/replace-read-file-sync/example-report.png?raw=true 'Example output')

## Expectations

-   Source code is TypeScript
-   `git` for version control
-   `prettier` for code formatting
-   `VSCode` as editor
-   You have `glow` installed and available in your `PATH` for formatting
    `markdown` in terminals (optional)

^ These are just a convenience assumptions at the moment and might change in
future.

## Roadmap

Currently working on `refactor` command, which will allow you to perform
refactoring.

-   [x] tested using `prompt` command whether the approach is going to work
-   [x] implementing initial version of the `refactor` command via "Plan and Execute" approach
-   [ ] provide documentation on the approach and what should be expected from the `refactor` command
-   [ ] ability to create pull requests in GitHub for both successful refactoring and discarded commits with issues
-   [ ] as every source code repository can be very different provide a `doctor` command to help diagnose setup issues and generally make `refactor` and `prompt` smarter aiming for no-config and automatic discovery/configuration
-   [ ] polishing and testing the experience more

## Privacy and Security

If you are concerned about privacy, consider using "business" account with OpenAI. Read their license agreement to understand how they can use the data we send there.

Otherwise, the use of the provided tools here is fully at your own risk. Ensure there are no secrets available to the bot in your projects directory or in environment variables so nothing can be leaked accidentally. Minimum precautions have been made so far to safeguard from accidental leaks as this is still just a POC.

### How a leak could occur in theory?

We use `ts-morph` to get access to the source code, which uses `TypeScript` compiler, which can read files in the repository. So if your source code has any secrets directly in code - they might end up being sent to OpenAI API.

### Other external services

We do not use other external services at the moment other than OpenAI API.

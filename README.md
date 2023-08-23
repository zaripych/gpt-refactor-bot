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
❯   test
    test.1
    test.2
    New conversation...
```

Select a file, and then you will be prompted to enter a message using your
editor. Save the message with `---` at the end to send it.

See example conversation at
[`.refactor-bot/prompts/example.md`](.refactor-bot/prompts/example.md).

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

[Example output](.refactor-bot/refactors/replace-read-file-sync/example-report.png?raw=true 'Example output')

## Roadmap

Currently working on `refactor` command, which will allow you to perform
refactoring.

-   [x] tested using `prompt` command whether the approach is going to work
-   [x] implementing initial version of the `refactor` command via "Plan and Execute" approach
-   [ ] provide documentation on the approach and what should be expected from the `refactor` command
-   [ ] ability to create pull requests in GitHub for both successful refactoring and discarded commits with issues
-   [ ] as every source code repository can be very different provide a `doctor` command to help diagnose setup issues and generally make `refactor` and `prompt` smarter aiming for no-config and automatic discovery/configuration
-   [ ] polishing and testing the experience more

## Expectations

-   Source code is TypeScript
-   `git` for version control
-   `prettier` for code formatting
-   `VSCode` as editor
-   You have `glow` installed and available in your `PATH` for formatting
    `markdown` in terminals (optional)

^ These are just a convenience assumptions at the moment and might change in
future.

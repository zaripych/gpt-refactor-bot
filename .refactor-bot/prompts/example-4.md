> This is a conversation with a OpenAI model. You can edit this file manually to
> enter a new prompt and then execute `pnpm refactor-bot prompt` to continue the
> conversation.

> Messages are separated by a `---`. The application is going to automatically
> add `> @role [user|assistant|system]` to the messages depending on their
> order. Feel free to modify the comment to change the role of a message. All
> quotes are considered comments.

> @role system

You think step by step. You are experienced developer that has access to a code
repository. You use the OpenAI functions calling to discover extra information
about the repository, provide analytics and help the user with their questions.
For example, you can list directory contents and read files to give the user
more details. The user is a developer who wants to learn more about the codebase
you have access to.

---

> @role user

Help me improve my `README.md` file. I want to make it clear and easy to
understand.

---

> @role assistant @function readFile

```json
{
    "filePath": "README.md"
}
```

---

> @role function @function readFile

````json
"# refactor-bot\n\n`refactor-bot` is a CLI for automated code refactoring using OpenAI's LLMs.\n\nBased on the goal provided by the user the CLI will use the OpenAI API to\ngenerate a plan for the refactoring, and refactor one file at a time using \"Plan\nand Execute\" technique, at the same time making sure the code still compiles and\npasses linting and tests.\n\nThe difference between `refactor-bot` and other tools is that it provides rich\nfunctions API based on `ts-morph` that allows it to extract TypeScript specific\ninformation from the codebase.\n\n## Installation\n\n```\ngit clone git@github.com:zaripych/refactor-bot.git\n```\n\n```\npnpm install\ncd /path/to/your/project\npnpm add /path/to/refactor-bot\npnpm add tsx                    # <- at the moment tsx is required for running TypeScript directly, we can tsc/bundle the refactor-bot later, if it works\npnpm refactor-bot --help\n```\n\n## Usage\n\nCreate `.env` file in current directory:\n\n```\nOPENAI_API_KEY=\"your-key\"\n```\n\nSupports commands at the moment:\n\n```sh\npnpm refactor-bot <command>\n\nCommands:\n  pnpm refactor-bot prompt      Sends a prompt to the ChatGPT API to generate a\n                                response\n  pnpm refactor-bot refactor    Performs a refactoring using Plan and Execute te\n                                chnique\n  pnpm refactor-bot completion  generate completion script\n\nOptions:\n  --help     Show help                                                 [boolean]\n  --version  Show version number                                       [boolean]\n```\n\n## Refactor\n\n```sh\n➜  pnpm refactor-bot refactor\n\nPerforms a refactoring using Plan and Execute technique\n\nOptions:\n  --help     Show help                                                 [boolean]\n  --version  Show version number                                       [boolean]\n  --name     Name of the refactoring to run                             [string]\n  --id       Unique id of the refactoring that was previously run but didn't fin\n             ish to start from last successful point                    [string]\n```\n\nAt first it will create a file for you with description of the refactor. Open\nthe file, edit it in your editor providing as much relevant information as you\nthink is needed, then rerun the command.\n\nFor an example,\n[have a look here](https://github.com/zaripych/refactor-bot/blob/5374a8381edb5b7adb431ff4847f826872221756/.refactor-bot/refactors/replace-read-file-sync/goal.md#L9).\n\nHere are steps that the CLI takes to execute the refactor:\n\n```mermaid\ngraph TD;\n  subgraph Refactor File\n    F1[\"Edit file via\n        ChatGPT prompt\"];\n\n    F1 --> F2[\"prettier && \\\n               eslint --fix\"]\n\n    F2 --> F3[\"Perform checks\n               like tsc, eslint,\n               re-run tests and\n               accumulate list\n               of issues\"]\n\n    F3 --> F4{\"Any issues found?\"}\n    F4 --> |No| FEnd[End]\n    F4 --> |Yes| F5[\"Summarize issues,\n               group issues as\n               external and internal\"]\n\n    F5 --> F6[\"Ask ChatGPT to\n               revert changes\n               in the file that\n               lead to issues in\n               other files, otherwise\n               ask it to resolve\n               internal issues\"]\n\n    F6 --> |Repeat| F3\n  end\n\n  subgraph Refactor Phase #2\n    Start --> F[\"Create a list of\n            files that require\n            refactoring based\n            on enriched goal\n            using ChatGPT prompt\"];\n\n    F --> G{\"Is the list empty?\"};\n    G -->|Yes| End[End];\n    G -->|No| K[[\"Refactor\n            every file\n            one by one\"]];\n    K -->|Repeat| F;\n  end\n\n  subgraph Preparation Phase #1\n    A[\"Load the\n      refactor goal & extra parameters\n      from .md file\"] --> B[\"Create sandbox\n                           in $TMPDIR\"];\n    B --> C[Reset to the start commit];\n    C --> D[\"Enrich the goal\n            with information\n            from functions ran\n            against codebase\"];\n    D --> E[\"Infer parameters from\n            the goal description -\n            like a list of files\n            that we are allowed\n            to edit\"];\n  end\n```\n\nRefactoring is considered a success if none of the changed files lead to\nTypeScript or eslint issues and all affected tests pass.\n\nAfter refactoring is complete, you will be presented with a report.\n\nRefactoring will not change any files in your local repository and you will be\nasked to merge the changes yourself.\n\nAt the moment the refactoring is performed in a way that doesn't allow module\ninterface to change. This means that the type that represents all exported\nmembers of a file will not change as a result of the refactoring. This is done\nto ensure that the refactoring is not going to break the codebase. This is\nlikely the most valuable use case, as it is more likely to result in a success.\nOther options are being considered.\n\nIt's likely refactoring might fail for one reason or the other. This could\nhappen for following reasons:\n\n-   Pre-requisites and expectations about the repository are not met by the CLI,\n    see expectations section below\n-   The OpenAI model is not capable of performing the refactoring either due to\n    the model limitations or lack of proper description\n-   There is a bug in the refactor-bot\n\nIn any case, the CLI was built in a way that it can reproduce all the successful\nsteps it had done during previous run without starting from scratch, as long as\nwe know the \"refactor-run-id\". So if you run the CLI again with the same `--id`\nit will start from the last successful step.\n\nUse `LOG_LEVEL=debug` environment variable to see more information about what's\nhappening.\n\n![Example output](.refactor-bot/refactors/replace-read-file-sync/example-report.png?raw=true 'Example output')\n\n## Expectations\n\n-   Source code is TypeScript\n-   `git` for version control\n-   `prettier` for code formatting\n-   `VSCode` as editor (optional)\n-   You have `glow` installed and available in your `PATH` for formatting\n    `markdown` in terminals (optional)\n\n## Prompt\n\nThe `prompt` command allows you to test the functions API we provide to the\nChatGPT and see what kind of information it can extract from the codebase.\n\nAt the moment the cli is not capable of aggregating information.\n\n```sh\n➜  pnpm refactor-bot prompt --watch\n? Select a file where the conversation is going to be stored › - Use arrow-keys. Return to submit.\n❯   example-1\n    example-2\n    New conversation...\n```\n\nSelect a file, and then you will be prompted to enter a message using your\neditor. Save the message with `---` at the end to send it.\n\nSee example conversation at\n[`.refactor-bot/prompts/example-1.md`](.refactor-bot/prompts/example-1.md).\n\n## Roadmap\n\nCurrently working on `refactor` command, which will allow you to perform\nrefactoring.\n\n-   [x] tested using `prompt` command whether the approach is going to work\n-   [x] implementing initial version of the `refactor` command via \"Plan and\n        Execute\" approach\n-   [x] provide documentation on the approach and what should be expected from\n        the `refactor` command\n-   [ ] ability to create pull requests in GitHub for both successful\n        refactoring and discarded commits with issues\n-   [ ] as every source code repository can be very different provide a `doctor`\n        command to help diagnose setup issues and generally make `refactor` and\n        `prompt` smarter aiming for no-config and automatic\n        discovery/configuration\n\n## Privacy and Security\n\nIf you are concerned about privacy, consider using \"business\" account with\nOpenAI. Read their license agreement to understand how they can use the data we\nsend there.\n\nOtherwise, the use of the provided tools here is fully at your own risk. Ensure\nthere are no secrets available to the bot in your projects directory or in\nenvironment variables so nothing can be leaked accidentally. Minimum precautions\nhave been made so far to safeguard from accidental leaks as this is still just a\nPOC.\n\n### How a leak could occur in theory?\n\nWe use `ts-morph` to get access to the source code, which uses `TypeScript`\ncompiler, which can read files in the repository. So if your source code has any\nsecrets directly in code - they might end up being sent to OpenAI API.\n\n### Other external services\n\nWe do not use other external services at the moment other than OpenAI API.\n"
````

---

> @role assistant

Sure, here's a more structured and easy to understand version of your
`README.md` file.

---

> @role user

# Refactor-Bot

`Refactor-Bot` is a command-line interface (CLI) designed for automated code
refactoring. Implementing the "Plan and Execute" technique, it works by
leveraging OpenAI API functionality to refactor code while ensuring the code
compiles and passes linting tests.

## Features

-   Extracts TypeScript specific information from the codebase utilizing
    `ts-morph` functions.
-   Performs refactoring without changing module interfaces.

## Installation

To install `Refactor-Bot`, follow the steps below:

1. Clone the repository:

```bash
git clone git@github.com:zaripych/refactor-bot.git
```

2. Install dependencies and add to your project:

```bash
npm install
cd /path/to/your/project
npm add /path/to/refactor-bot
npm add tsx
```

For usage, simply run: `npm refactor-bot --help`.

## Usage

### Configuration

Create a `.env` file in your project's root directory containing your
`OPENAI_API_KEY`, like this:

```bash
OPENAI_API_KEY="your-key"
```

### Commands

`Refactor-bot` currently supports the following commands:

```bash
npm refactor-bot <command>
```

-   `prompt`: Sends a prompt to the ChatGPT API to generate a response
-   `refactor`: Performs a refactoring using Plan and Execute technique
-   `completion`: Generate completion script

## Refactoring Process

To initiate the refactoring process, use the command below and provide the name
and unique id of the refactoring to be run, and then follow the on-screen
prompts.

```bash
npm refactor-bot refactor --name <refactoring_name> --id <unique_id>
```

For a step-by-step example of how the refactoring process works, please refer to
the `refactor-bot`
[usage guide](https://github.com/zaripych/refactor-bot/blob/5374a8381edb5b7adb431ff4847f826872221756/.refactor-bot/refactors/replace-read-file-sync/goal.md#L9).

## Debugging

Should the refactoring process fail, you can rerun the CLI again with the same
`--id` to pick up from the last successful step. To view detailed debugging
information, set the `LOG_LEVEL` environment variable to `debug`.

## Expectations

`Refactor-bot` is intended for use with TypeScript source code, using `git` for
version control, `prettier` for code formatting, and optionally `VSCode` as the
editor and `glow` for formatting markdown in terminals.

## Roadmap

Here's a glimpse into `refactor-bot` development progress and upcoming features:

-   [x] Implemented `prompt` command to determine if the approach works.
-   [x] Implemented initial version of `refactor` command using "Plan and
        Execute" technique.
-   [x] Provided extensive documentation on the approach and expectations from
        `refactor` command.
-   [ ] Capability to create pull requests on GitHub for both successful and
        discarded refactorings.
-   [ ] Ensure automatic configuration through a `doctor` command.

Please note that this is a proof of concept (POC) and, while minimum precautions
have been taken, the use of this tool is at your own risk. It is recommended to
use a business account with OpenAI, and to avoid storing any sensitive
information in your project directory or in environment variables which the bot
can access.

---

> @role user

Feel free to modify it to better match your project's needs.

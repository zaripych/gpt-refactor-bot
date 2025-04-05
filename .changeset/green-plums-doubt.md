---
'refactor-bot': major
---

Allow using models other than Chat-GPT, using LangChain universal chat model
behind the scenes, tested using Anthropic Claude 3.7. All you need to do to
specify a different model is use LangChain's model provider specifier before the
model. For example "anthropic:claude-3-7-sonnet-latest".

Unfortunately, introduction of the feature now makes maintaining the cost
calculation a bit difficult, so cost estimation/calculation was removed from the
refactor-bot.

# 52: Map VS Code models to price-table entries

**Iteration:** 7 (Live pricing)

## Description
The price table names models by display name (`GPT-5 mini`, `Claude Sonnet 5.5`). VS Code exposes `LanguageModelChat.name` (the picker's display name), plus vendor-defined `family` and `id` slugs. Match in this order ([PLAN §9.1](../PLAN.md#91-cost-unit-and-live-prices)):
1. `name`, normalised (case-insensitive, footnotes stripped, whitespace collapsed)
2. the slug of each table name (`gpt-5-mini`) compared with `family`, then `id`
3. a `modelPrices` override key (by name, family or id)
4. otherwise unknown → the most expensive rates, with ⚠️ (#48)

The "Auto" model hides the real model and is treated as unknown, with a hint in the warning.

## Tests to write first
- `matches on display name ignoring case and extra spaces`
- `matches a table name with a footnote marker`
- `matches family "gpt-5-mini" to "GPT-5 mini" via the slug`
- `matches id when family does not match`
- `prefers a name match over a slug match for a different model`
- `an override key matches by name, family or id`
- `a "(fast mode) (preview)" variant does not match its base model`
- `"Auto" is unknown and the warning suggests picking a model`
- `returns unknown when nothing matches`

## Implementation tasks
- [ ] `src/core/pricing/matchModel.ts`, used by `CreditCostModel`
- [ ] A dev-only command, `Q0T4: Log Copilot Models`, that lists `name`/`family`/`id`/`vendor` of every `vscode.lm.selectChatModels({ vendor: "copilot" })` result to the output channel

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green
- [ ] Manual: run "Log Copilot Models" with a signed-in Copilot, paste the output into the PR, and confirm that every model you use matches a price-table entry (add tests for any real naming pattern that doesn't)

## Depends on
#48, #49

## Labels
`feature`

## Estimate
S

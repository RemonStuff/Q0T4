# 17: Core formatting: amounts, footer and warnings

**Iteration:** 2 (Counting and the hard stop)

## Description
Every user-visible usage string comes from pure `core/format`. This issue covers:
- **Unit-aware amounts:** tokens compact (`112k`, `1.25M`); credits with thousands separators (`2,100`) and one decimal below 10 (`7.4`)
- **The footer:** `*RemonStuff/Q0T4: 112k / 150k this week · resets Mon · GPT-5*` in tokens mode, or `… 2,100 / 3,390 credits this week …` in credits mode. It ends with the name of the model that answered (from `ModelPort.name`) and sits behind a hidden sentinel (`<!-- q0t4:footer -->`), so it can be stripped from history later (#18).
- **The ⚠️ warning** once usage passes `warnAtPercent` of the weekly budget

The pool parts of the footer (month, reserve) are added in #61.

## Tests to write first
- `formats tokens: 0 as "0", 950 as "950", 1000 as "1k", 112400 as "112k", 1250000 as "1.25M"`
- `formats credits: 2100 as "2,100", 7.43 as "7.4", 0 as "0"`
- `rounds down so the footer never overstates remaining budget` (each unit)
- `footer starts with the sentinel and a blank line`
- `footer shows subject, used, budget, unit label and reset label` (each unit)
- `footer ends with the model name, e.g. "· GPT-5"`
- `footer omits the model part when no model was called` (refusals, `/use` with no question)
- `footer escapes markdown special characters in the model name`
- `footer escapes markdown special characters in subject names`
- `adds a ⚠️ warning when weekly usage is at or above warnAtPercent`
- `no warning just below warnAtPercent`
- `shows ⛔ instead of ⚠️ when usage is at or above 100%`

## Implementation tasks
- [ ] `src/core/format/amount.ts`, `footer.ts`, `warnings.ts`
- [ ] Export the `FOOTER_SENTINEL` constant

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green

## Depends on
#03

## Labels
`feature`

## Estimate
S

# 18: Strip footers from history and return `ChatResult.metadata`

**Iteration:** 2 (Counting and the hard stop)

## Description
Our footer and warnings come back in `ChatResponseTurn.response` and must not be re-sent to the model, where they would waste tokens and invite the model to echo them. Strip everything from the sentinel onwards when building history.

Each response also returns `metadata: { v: 1, subject, model, unit, inputTokens, outputTokens, cost, stopped }`, which later drives the thread subject (#28) and the same-subject history (#32).

## Tests to write first
- `strips the footer and warnings after the sentinel from assistant history`
- `leaves assistant text without a sentinel unchanged`
- `strips only from the last sentinel`, so a reply that quotes the sentinel keeps its earlier content
- `drops an assistant turn that is empty after stripping`
- `handler returns metadata with subject, model, unit, inputTokens, outputTokens, cost and stopped`
- `metadata.model is the name of the model that answered`
- `metadata.cost is in the active unit` (each unit)
- `metadata stopped is "budget" after a cut-off, "cancelled" after a user cancel, false otherwise`

## Implementation tasks
- [ ] `stripFooter` in `core/messages`, used by `buildMessages`
- [ ] Build metadata in `chatHandler`, validated with `isResultMetadata` (#03)

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green

## Depends on
#08, #17

## Labels
`feature`

## Estimate
S

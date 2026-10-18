# 15: Core `StreamGuard`: adaptive recount and cut-off

**Iteration:** 2 (Counting and the hard stop)

## Description
While streaming, decide when to recount output tokens and when to stop. Calling `countTokens` on every chunk is wasteful, and calling it rarely overshoots. Strategy (PLAN §5):
- Between recounts, estimate with `chars / 4`.
- Recount every ~400 characters while the estimate is far from the budget.
- Recount on **every chunk** once the estimated remaining budget is under 10%, or under 2× the size of the last chunk.
- When `used + input + output ≥ limit`, cancel the model's token source, stop forwarding chunks and write `⛔ Stopped: <subject> weekly budget reached.`

## Tests to write first
- `does not recount before ~400 characters while far from the limit`
- `recounts every chunk when estimated remaining is under 10%`
- `recounts every chunk when remaining is under twice the last chunk size`
- `cancels the model signal when output reaches the remaining budget`
- `does not forward chunks after cancelling`
- `appends the ⛔ Stopped note exactly once`
- `does not cancel when the budget is never reached`
- `final output count comes from a real recount, not the estimate`
- `overshoot never exceeds one recount interval` (property-style test over several chunk sizes)
- `budget of 0 remaining cancels on the first chunk`

## Implementation tasks
- [ ] `src/core/budget/streamGuard.ts`: `onChunk(text) → "continue" | "stop"`, `finalCount()`
- [ ] Constants (`RECOUNT_CHARS`, `NEAR_LIMIT_RATIO`) exported for tests and documented
- [ ] Integrate into `chatHandler`'s streaming loop

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green
- [ ] FakeModel call-count assertions show far fewer recounts than chunks for long replies

## Depends on
#13

## Labels
`feature`

## Estimate
M

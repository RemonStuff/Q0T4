# 13: Core `countInput`

**Iteration:** 2 (Counting and the hard stop)

## Description
Count the tokens of everything we're about to send, by summing `ModelPort.countTokens(message)` over every message (history, references, prompt). Counting happens before the pre-check (#14), so it must respect cancellation and not swallow errors silently.

## Tests to write first
- `sums countTokens across all messages`
- `returns 0 for an empty message list`
- `counts reference and history messages, not just the prompt`
- `counts messages in parallel but returns a deterministic total`
- `stops and throws a Cancelled error when the signal fires during counting`
- `propagates a countTokens failure as a typed CountError`

## Implementation tasks
- [ ] `src/core/budget/countInput.ts`
- [ ] Add `Cancelled` / `CountError` to `core/errors`

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green

## Depends on
#10

## Labels
`feature`

## Estimate
S

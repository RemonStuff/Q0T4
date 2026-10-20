# 13: Core `countInput` and the `CostModel` interface

**Iteration:** 2 (Counting and the hard stop)

## Description
Count the tokens of everything we're about to send, by summing `ModelPort.countTokens(message)` over every message (history, references, prompt). Counting happens before the pre-check (#14), so it must respect cancellation and not swallow errors silently.

Raw tokens are then turned into a **cost** through the existing
[`CostModel`](../../src/core/cost/costModel.ts), so every later step (pre-check,
cut-off, recording) works in the active budget unit. This issue reuses that
interface and adds `TokenCostModel` (cost = tokens). `CreditCostModel` follows
in #48.

## Tests to write first
- `sums countTokens across all messages`
- `returns 0 for an empty message list`
- `counts reference and history messages, not just the prompt`
- `counts messages in parallel but returns a deterministic total`
- `stops and throws a Cancelled error when the signal fires during counting`
- `propagates a countTokens failure as a typed CountError`
- `TokenCostModel cost equals input + output tokens`
- `TokenCostModel has unit "tokens" and returns no rate snapshot`

## Implementation tasks
- [x] `src/core/budget/countInput.ts`
- [x] `src/core/cost/tokenCostModel.ts` (the `CostModel` interface already exists in `costModel.ts`, added in #4 for the fixed-rate test double)
- [x] Add `Cancelled` / `CountError` to `core/errors`

## Implemented behavior and local proof

This is core-only work, implemented locally and not published. The participant
does not call these helpers yet; budget enforcement wiring remains in #19.

- Count every complete message once, forwarding the same cancellation signal.
  Counts start in parallel, but their total does not depend on completion order.
  A normal empty list returns zero without provider calls or a listener.
- An already-cancelled signal rejects before any work, even for an empty list.
  Cancellation while counting rejects promptly with `Cancelled`, without
  waiting for a tokenizer that ignores cancellation. The provider may still
  finish internally.
- Counting failures, including synchronous throws and non-Error rejections,
  produce `CountError` with the original cause and a safe public message.
  Cancellation wins when observed before completion. Dispose the cancellation
  subscription on all outcomes and handle late in-flight rejections.
- `TokenCostModel` has unit `"tokens"` and returns
  `{ cost: { tokens: input + output } }`. Credits and rates are absent.
  Neither helper changes its inputs or sends a model request.

Red-first command:

```sh
npm test -- test/unit/core/budget/countInput.test.ts test/unit/core/cost/tokenCostModel.test.ts
```

Against inert API scaffolds, 22 tests failed for expected behavioral reasons and
three passed, without unhandled errors. The same 25 tests then passed after
implementation. Missing-module failures from the initial test-only run are not
claimed as behavioral red proof. One additional cancellation-flag
characterization brings the focused suite to 26 tests.

The full local `npm run coverage` passes all 201 unit tests, with 100% core line
and branch coverage. Tests use fakes and deferred promises, not real models or
timing-based sleeps. Hosted integration and installed-VSIX checks remain pending
an approved publication; assistant-run VS Code tests do not run on the Mac.

## Acceptance criteria
- [x] Local unit tests pass and core coverage holds
- [ ] The listed tests pass, core coverage holds, and CI is green

## Depends on
#10

## Labels
`feature`

## Estimate
S

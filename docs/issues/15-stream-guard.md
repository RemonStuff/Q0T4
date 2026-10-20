# 15: Core `StreamGuard`: adaptive recount and cut-off

**Iteration:** 2 (Counting and the hard stop)

## Description
While streaming, decide when to recount output tokens and when to stop. Calling `countTokens` on every chunk is wasteful, and calling it rarely overshoots. The guard works in **cost**: it converts output tokens with the active `CostModel` (#13), so in credits mode the output rate decides how fast the budget runs out. Strategy (PLAN §5):
- Between recounts, estimate tokens with `chars / 4` and cost them with the `CostModel`.
- Recount every ~400 characters while the estimate is far from the budget.
- Recount on **every chunk** once the estimated remaining budget is under 10%, or under 2× the cost of the last chunk.
- When `used + inputCost + outputCost ≥ budget + extraAllowance`, cancel the model's token source, stop forwarding chunks and write `⛔ Stopped: <subject> weekly budget reached.`

## Tests to write first
*(each runs for tokens and credits)*
- `does not recount before ~400 characters while far from the budget`
- `recounts every chunk when estimated remaining is under 10%`
- `recounts every chunk when remaining is under twice the last chunk's cost`
- `cancels the model signal when output cost reaches the remaining budget`
- `does not forward chunks after cancelling`
- `appends the ⛔ Stopped note exactly once`
- `does not cancel when the budget is never reached`
- `final output count comes from a real recount, not the estimate`
- `detection overshoot stays within one uncounted character interval plus the arriving chunk` (property-style tests with deterministic tokenizers over several chunk sizes; not a real billing cap)
- `budget of 0 remaining cancels on the first chunk`
- `an extra allowance moves the cut-off point by exactly that amount`

*(credits only)*
- `a higher output rate stops the reply after fewer tokens`

## Implementation tasks
- [x] `src/core/budget/streamGuard.ts`: async `onChunk(text) → "continue" | "stop"`, async `finalCount()`
- [x] Constants (`RECOUNT_CHARS`, `NEAR_LIMIT_RATIO`) exported for tests and documented
- [x] Integrate into `chatHandler`'s streaming loop behind the optional budget context

## Implementation and verification

Implemented on `feat/15-stream-guard`. The pull request records exact-source
hosted results when available; merge needs separate approval. Installed
activation remains in #19.

- `RECOUNT_CHARS = 400` measures new JavaScript `text.length` characters
  (UTF-16 code units). Recount the entire accumulated output.
- Between recounts, estimate only the new text with `chars / 4`, anchored to
  the last real count. Convert with `{ input: 0, output }` so credits use the
  output rate.
- `NEAR_LIMIT_RATIO = 0.1` compares estimated remaining cost with the effective
  budget. Recount every chunk once remaining is strictly below 10% or twice
  the latest chunk's estimated cost; keep that mode until the reply ends.
- Only a real count reaching `used + input + output >= budget + allowance`
  triggers the cut-off. A zero remaining budget stops on the first chunk.
  Estimates trigger recounts, not premature refusals.
- **Approved boundary behavior:** show the already-received limit-reaching
  chunk, then cancel the model and read or forward no later chunks. It still
  counts because the model generated it. A separate linked model signal keeps
  a budget stop distinct from user cancellation.
- Emit one escaped `⛔ Stopped: <subject> weekly budget reached.` note.
  Metadata is `{ outcome: "stopped", stopped: "budget", model }`, with no
  invented usage. User cancellation stays silent.
- Await guard calls sequentially. `finalCount()` uses the real tokenizer,
  reusing an unchanged real count; an empty reply costs zero without a call.
  A limit first discovered at the final recount is reported as a budget stop.
- Shared input/output counting preserves typed failures, prompt cancellation,
  listener disposal and observation of late rejections. Input errors retain
  their original messages; output errors identify output counting. Invalid
  counts and output costs fail explicitly.
- Counting, pricing and iterator failures use the safe error path and cancel
  the producer. Output-write failures still propagate. Linked cancellation is
  released on normal completion and every failure or stop path.
- The handler finalizes counting on normal completion and budget stops.
  Recording and real recounts on every exit, including user cancellation and
  errors, belong to #16. The installed no-budget path still never counts.

An arriving chunk can exceed 400 characters. Tests bound detection overshoot
by the previous uncounted interval plus that chunk using a known
one-token-per-character fake. They cover chunk sizes 4, 16, 64, 399, 400, 401
and 1600 in both units. This is not a universal token/credit bound: arbitrary
token density, hidden reasoning and generation before provider cancellation
takes effect can add usage that is not bounded by the character interval.

Red-first and focused green command:

```sh
npm test -- \
  test/unit/core/budget/streamGuard.test.ts \
  test/unit/core/budget/streamGuardHandler.test.ts \
  test/unit/core/cancellation/createCancellation.test.ts \
  test/unit/core/format/formatStopped.test.ts
```

Against inert API scaffolds and the unchanged handler, 75 tests failed for
expected behavioral reasons and 10 passed, with no unhandled errors. Initial
missing-module failures are excluded from red proof. All 85 cases passed
after implementation. Nine later cancellation and cleanup characterizations
bring the focused suite to 94 tests; those are not claimed as red-first proof.
The existing metered-handler tests now expect the intentionally added stream
stop after an admitted exact input fit.

A follow-up failure-path assertion ran red before its repair: a failed final
recount reported an error but left the model source uncancelled after a
naturally completed iterator. The filtered test had one expected failure
and 26 non-selected tests. The handler now cancels on that failure without
calling `return()` on an already-completed iterator.

`npm run coverage` passes all 399 unit tests with 100% core statements,
branches, functions and lines. An affordable 1000-chunk reply uses only 10 real
output counts. Strict main/integration TypeScript and lint also pass.
Integration and installed-VSIX tests must run on GitHub-hosted runners after
approved publication, not on the Mac. No automated test calls real Copilot;
fake-provider checks do not prove installed enforcement or real billing.

## Acceptance criteria
- [x] Local unit tests pass and core coverage holds
- [ ] The listed tests pass, core coverage holds, and CI is green
- [x] FakeModel call-count assertions show far fewer recounts than chunks for long replies

## Depends on
#13

## Labels
`feature`

## Estimate
M

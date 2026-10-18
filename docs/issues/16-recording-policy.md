# 16: Usage recording policy, always in `finally`

**Iteration:** 2 (Counting and the hard stop)

## Description
Spec: *always, even on cancel or error*, record what was used. This issue makes that a pure, tested policy that `chatHandler` runs in a `finally` block. It decides exactly what is charged in each outcome. Decided (open question 2): **nothing is charged when `sendRequest` rejects before any chunk; input + counted output is charged once streaming has started.**

What gets recorded is a **ledger entry** ([PLAN §4](../PLAN.md#4-data-model-an-append-only-ledger)): raw tokens, the model's name and family, the cost from the `CostModel` (tokens always, credits when rates are known), the rate snapshot used, `source: "q0t4"`, and whether the reply was stopped. Past entries are never repriced.

## Tests to write first
*(each runs for tokens and credits)*
- `records input and output on success`
- `records input and output so far when the user cancels`
- `records input and output so far when the stream throws mid-way`
- `records input and output when StreamGuard stops the reply`
- `records nothing for the model call when sendRequest rejects before streaming`
- `records nothing when the pre-check refuses`
- `output is recounted from accumulated text, never estimated, before recording`

*(unit-independent)*
- `the entry carries raw tokens, model name and family, and source "q0t4"`
- `the entry carries the rate snapshot it was costed with` (credits)
- `the entry always carries cost.tokens, and cost.credits only when rates are known`
- `still writes the footer when recording fails` (a write error is logged, not thrown)

## Implementation tasks
- [ ] `src/core/budget/recordingPolicy.ts`: `(outcome) → LedgerEntry | null`
- [ ] A `UsageSink` interface used by the handler. It's implemented by an in-memory sink now, by a globalState totals store in #19, and by the `Ledger` in #25.
- [ ] Restructure `chatHandler` as try/catch/finally

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green

## Depends on
#15

## Labels
`feature`

## Estimate
M

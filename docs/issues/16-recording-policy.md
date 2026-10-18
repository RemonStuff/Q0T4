# 16: Usage recording policy, always in `finally`

**Iteration:** 2 (Counting and the hard stop)

## Description
Spec: *always, even on cancel or error*, record input + output. This issue makes that a pure, tested policy that `chatHandler` runs in a `finally` block. It decides exactly what is charged in each outcome. Decided (open question 2): **nothing is charged when `sendRequest` rejects before any chunk; input + counted output is charged once streaming has started.** Classifier tokens (#30) are always charged.

## Tests to write first
- `records input and output on success`
- `records input and output so far when the user cancels`
- `records input and output so far when the stream throws mid-way`
- `records input and output when StreamGuard stops the reply`
- `records nothing for the model call when sendRequest rejects before streaming`
- `records nothing when the pre-check refuses` (classifier tokens excepted, see #30)
- `still writes the footer when recording fails` (storage error is logged, not thrown)
- `output is recounted from accumulated text, never estimated, before recording`

## Implementation tasks
- [ ] `src/core/budget/recordingPolicy.ts`: `(outcome) → { input, output } | null`
- [ ] A `UsageSink` interface used by the handler. It's implemented by an in-memory store now, then by `globalState` in #19 and by BudgetStore in #25.
- [ ] Restructure `chatHandler` as try/catch/finally

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green

## Depends on
#15

## Labels
`feature`

## Estimate
M

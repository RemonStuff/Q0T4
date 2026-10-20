# 14: Core `preCheck` and refusal message

**Iteration:** 2 (Counting and the hard stop)

## Description
Before calling the model, refuse if `usedThisWeek + estimatedInputCost > weeklyBudget`, all in the active unit (via `CostModel`, #13). The refusal shows the subject, used, budget, remaining and reset date, so the user knows exactly where they stand. The decision and the message are both pure.

The decision takes an optional `extraAllowance` (default 0), which is the reserve hook used by #57. Behaviour tests are written once and run for each unit with `describe.each([tokens, credits])`, using a fixed-rate `CostModel` for credits ([PLAN §7](../PLAN.md#unit-generic-tests)).

## Tests to write first
*(each runs for tokens and credits)*
- `allows when estimated cost is below the remaining weekly budget`
- `allows when estimated cost equals the remaining weekly budget exactly`
- `refuses when estimated cost exceeds remaining weekly budget`
- `refuses when the weekly budget is 0`
- `refuses when used already exceeds the budget` (overshoot from an earlier cut-off)
- `remaining is never negative`
- `allows when the extra allowance covers the gap`
- `refusal shows subject, used, budget, remaining and reset date in the active unit`

*(unit-independent)*
- `refusal suggests /status and /use`
- `handler does not call sendRequest when refused`
- `handler returns metadata with stopped "precheck" when refused`

## Implementation tasks
- [x] `src/core/budget/preCheck.ts` returning `{ allowed: true } | { allowed: false; used; budget; remaining }` (all `Cost`)
- [x] `formatRefusal` in `core/format`. Takes the reset label and unit as inputs; the label is caller-supplied now, calculated once #21 lands.
- [x] Call it in `chatHandler` after `countInput`, when an optional budget context is supplied

## Implementation and verification

Merged in [PR #80](https://github.com/RemonStuff/Q0T4/pull/80) as `f50609d`.
This does not activate installed budget enforcement.

- `preCheck` compares only the active unit. Effective budget is base budget
  plus optional allowance. Equality fits a positive effective budget; zero
  always refuses, including zero-cost requests. Allowance can cover an existing
  overshoot. Remaining amounts are clamped before this request, not after it.
- Supplied costs must be finite and nonnegative. Missing active credits throw
  `TypeError`; invalid amounts and an overflowing effective budget throw
  `RangeError`. Known inactive costs are preserved; unknown credits stay absent.
  No rounding or tolerance changes the boundary.
- `formatRefusal` shows exact values in the active unit and the supplied reset
  label, escapes Markdown and normalizes line breaks in labels. It includes
  `/status` and `/use` hints without implementing commands or calendar logic.
- The optional handler `BudgetContext` supplies all state. The handler counts
  the resolved model's complete messages, converts input with zero output cost,
  and refuses before `sendRequest`. Refusal metadata is exactly
  `{ outcome: "refused", stopped: "precheck" }`, without an answering model or
  invented usage. Full usage metadata stays in #18.
- Counting, cost and policy failures use the safe generic error path without
  sending; cancellation is silent. Output-write failures still propagate.
  Without a budget context, the existing flow does not count tokens.
- `extension.ts` remains unchanged. Storage, default totals and participant
  activation remain in [#19](19-wire-budget-enforcement.md). No settings,
  recording or stream cut-off were added.

Red-first and focused green command:

```sh
npm test -- \
  test/unit/core/budget/preCheck.test.ts \
  test/unit/core/budget/preCheckHandler.test.ts \
  test/unit/core/format/formatRefusal.test.ts \
  test/unit/core/cost/costAmount.test.ts
```

Against inert helper scaffolds and the unchanged handler, 88 assertions failed
for expected behavioral reasons and 15 cases passed. One additional
fallback-model case had a fixture vendor mismatch, excluded from red proof;
the corrected fixture matches the resolver's Copilot lookup. Initial
missing-module failures are also excluded. No unhandled errors occurred.
After implementation and the fixture correction, all 104 focused tests pass.

`npm run coverage` passes all 305 unit tests with 100% core statements, branches,
functions and lines. Tests cover both units, exact and fractional boundaries,
zero budget, overshoot, extra allowance, invalid state, safe formatting,
complete-message counting, cancellation, error paths and unchanged unmetered
behavior. They use fakes; no test calls real Copilot. Automated VS Code
integration and installed-VSIX tests run only on GitHub-hosted runners after
publication, not on the work Mac. Their results protect the unchanged installed
flow, not active installed enforcement.

Exact-main [CI 39400529159](https://github.com/RemonStuff/Q0T4/actions/runs/39400529159)
passed all five hosted jobs: lint/format/types, 305 unit tests on each Ubuntu
and Windows job, 57 integration tests and 12 installed-VSIX tests. Actual logs,
executed steps, matching PR/main whole trees and the non-expired tested VSIX
artifact were read back. [Completion evidence](https://github.com/RemonStuff/Q0T4/issues/14#issuecomment-6287845367)
records the result.

Issue #15 extends the optional metered path: a request that exactly fits its
input budget is still admitted, then its first output chunk triggers the
stream cut-off. This does not change the pure pre-check's equality rule.

## Acceptance criteria
- [x] Local unit tests pass and core coverage holds
- [x] The listed tests pass, core coverage holds, and CI is green

## Depends on
#13

## Labels
`feature`

## Estimate
S

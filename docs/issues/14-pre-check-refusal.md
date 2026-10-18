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
- [ ] `src/core/budget/preCheck.ts` returning `{ allowed: true } | { allowed: false; used; budget; remaining }` (all `Cost`)
- [ ] `formatRefusal` in `core/format`. Takes the reset date and unit as inputs; the reset date is a placeholder now, real once #21 lands.
- [ ] Call it in `chatHandler` after `countInput`

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green

## Depends on
#13

## Labels
`feature`

## Estimate
S

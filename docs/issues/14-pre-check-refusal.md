# 14: Core `preCheck` and refusal message

**Iteration:** 2 (Counting and the hard stop)

## Description
Before calling the model, refuse if `used + input > limit`. The refusal shows the subject, used, limit, remaining and reset date, so the user knows exactly where they stand. The decision and the message are both pure.

## Tests to write first
- `allows when used + input is below the limit`
- `allows when used + input equals the limit exactly`
- `refuses when used + input exceeds weekly limit`
- `refuses when the limit is 0`
- `refuses when used already exceeds the limit` (overshoot from an earlier cut-off)
- `remaining is never negative`
- `refusal shows subject, used, limit, remaining and reset date`
- `refusal suggests /status and /use`
- `handler does not call sendRequest when refused`
- `handler returns metadata with stopped "precheck" when refused`

## Implementation tasks
- [ ] `src/core/budget/preCheck.ts` returning `{ allowed: true } | { allowed: false; used; limit; remaining }`
- [ ] `formatRefusal` in `core/format`. Takes the reset date as an input: a placeholder now, real once #21 lands.
- [ ] Call it in `chatHandler` after `countInput`

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green

## Depends on
#13

## Labels
`feature`

## Estimate
S

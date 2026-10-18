# 21: Core next reset and reset labels

**Iteration:** 3 (Weekly storage)

## Description
Compute when the current week ends, for the footer ("resets Mon"), the refusal message ("resets Mon 19 Oct") and the status bar refresh timer (#36). The labels use English weekday and month abbreviations so tests are stable. Localisation is out of scope for v1.

## Tests to write first
- `nextReset is weekStart + 7 days at local midnight`
- `short label is the weekday abbreviation, e.g. "Mon"`
- `long label includes day and month, e.g. "Mon 19 Oct"`
- `just before midnight on the last day, nextReset is minutes away`
- `exactly at reset, nextReset is a full week away`
- `msUntilReset is positive and correct across a DST change`

## Implementation tasks
- [ ] `src/core/time/reset.ts`: `nextResetKey`, `msUntilReset`, `formatResetShort`, `formatResetLong`
- [ ] Replace the placeholder reset text in `formatRefusal` (#14) and `footer` (#17)

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green

## Depends on
#20

## Labels
`feature`

## Estimate
S

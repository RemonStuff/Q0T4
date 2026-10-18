# 58: Monthly pace warning

**Iteration:** 8 (Pool, reserve and sync)

## Description
In pool mode, warn when a subject is using its monthly share much faster than the cycle is passing ([PLAN §9.4](../PLAN.md#94-warnings)):

```
pace = (cycleUsed / monthlyShare) ÷ (elapsedCycleDays / cycleDays)
warn when pace ≥ monthlyPaceWarning (default 1.5) and cycleUsed ≥ 10% of the share
```

It's a warning only, shown after the footer sentinel, next to the daily pace (#24) and `warnAtPercent` warnings.

## Tests to write first
- `no warning when pace is below monthlyPaceWarning`
- `warns at exactly monthlyPaceWarning`
- `no warning before the subject has used 10% of its share, even at a high pace`
- `elapsed days count the current day as started`, so day 1 isn't a division by zero
- `the warning shows the pace (e.g. "2.1× faster than the cycle") and the share used`
- `no monthly pace warning without a pool`
- `monthlyPaceWarning below 1 is rejected with a settings warning and uses 1.5`
- `warnings appear in a fixed order: weekly %, daily pace, monthly pace`

## Implementation tasks
- [ ] `monthlyPace` in `core/budget`, plus a formatter in `core/format/warnings`
- [ ] The `monthlyPaceWarning` setting

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green

## Depends on
#24, #55

## Labels
`feature`

## Estimate
S

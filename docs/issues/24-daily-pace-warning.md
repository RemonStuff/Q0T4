# 24: Daily pace tracking and warning

**Iteration:** 3 (Weekly storage)

## Description
Warn, without blocking, when a subject uses more than `dailyPaceWarning`% (default 30%) of its weekly limit within one local day. The warning appears in the footer area alongside the `warnAtPercent` warning.

## Tests to write first
- `no pace warning when today's usage is below the threshold`
- `pace warning when today's usage reaches dailyPaceWarning % of the weekly limit`
- `pace warning shows today's usage and the threshold`
- `pace resets at local midnight` (FixedClock: 23:59 warns, then after 00:00 the next request doesn't)
- `pace and warnAtPercent warnings can both appear, pace second`
- `pace warning never blocks a request`

## Implementation tasks
- [ ] `paceWarning(usedToday, weeklyLimit, percent)` in `core/budget`
- [ ] Extend `core/format/warnings`
- [ ] Use `BudgetStore.usedToday` in the handler (wired in #25)

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green

## Depends on
#17, #22

## Labels
`feature`

## Estimate
S

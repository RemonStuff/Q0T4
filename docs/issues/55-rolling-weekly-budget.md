# 55: Core rolling weekly budget from a monthly share

**Iteration:** 8 (Pool, reserve and sync)

## Description
With a pool, a subject's enforced weekly budget is derived from its monthly share ([PLAN §9.2](../PLAN.md#92-two-time-levels-a-monthly-cycle-with-weekly-enforcement)):

```
remainingInCycle = monthlyShare − cycleUsage(subject, cycleStart … weekStart)
weeklyBudget     = remainingInCycle × daysOfWeekInsideCycle / daysRemainingInCycle(weekStart)
```

- A week that spans a cycle boundary adds the new cycle's part: `newShare × daysInNewCycle / cycleDays(newCycle)`.
- Computed **once per week**, from usage before the week starts, and stored as a `budget` ledger entry. If several snapshots exist for the same subject and week, the earliest `at` wins.
- Without a pool, the weekly budget is the fixed limit from #26, so `WeeklyBudget` has one interface for both modes.

## Tests to write first
- `first week of a 31-day cycle that starts on the week's first day, with share 15,000, gets 15,000 × 7/31`
- `a partial first week (cycle starts mid-week) gets share × daysInsideCycle / 31`
- `unused budget spreads: after spending nothing in week 1, week 2 gets remaining × 7/24`
- `overspending lowers later weeks`
- `a subject that overspent its whole share gets 0, never a negative budget`
- `nothing carries over: the first week of a new cycle ignores last cycle's leftovers`
- `a week spanning the cycle end gets old-cycle part + new-cycle part, split by days`
- `the budget is fixed for the week: requests during the week don't change it`
- `the snapshot is computed from usage before weekStart, so two windows get the same value`
- `with two snapshots for one week, the earliest wins`
- `a share change mid-week applies from next week`
- `without a pool, the weekly budget is weeklyLimitFor(subject)`
- `works identically in tokens and credits` (each unit)

## Implementation tasks
- [ ] `src/core/budget/weeklyBudget.ts` (fixed and pool strategies)
- [ ] `budget` entries in the `Ledger` (`snapshotFor(subject, week)`)

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green

## Depends on
#22, #54

## Labels
`feature`

## Estimate
M

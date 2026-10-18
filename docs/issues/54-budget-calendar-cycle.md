# 54: Core `BudgetCalendar`: billing cycle level

**Iteration:** 8 (Pool, reserve and sync)

## Description
Add the monthly **billing cycle** to `BudgetCalendar` (#20, [PLAN §9.2](../PLAN.md#92-two-time-levels-a-monthly-cycle-with-weekly-enforcement)):
- `cycleWindow(instant)` returns the local `[start, end)` days of the current cycle for `q0t4.cycleStartDay` (1–31), **clamped to the last day of short months** (31 → 30 Apr, 31 → 28/29 Feb)
- `daysOfWeekInsideCycle(week, cycle)`, `daysRemainingInCycle(fromDay)` and `cycleDays(cycle)`
- `splitWeekAtCycleBoundary(week)` returns the part of the week in each cycle, in days

Like the week level, it's all local-calendar arithmetic on day keys with the IANA zone, never milliseconds.

## Tests to write first
- `cycleStartDay 1: 2026-10-18 is in the cycle 2026-10-01 … 2026-11-01`
- `cycleStartDay 15: 2026-10-14 belongs to the cycle that started 2026-09-15`
- `cycleStartDay 31 clamps to 30 April and to 28 February 2027`
- `cycleStartDay 29 clamps to 28 February in 2027 but not in leap year 2028`
- `cycleStartDay 30 in February 2028 clamps to the 29th`
- `cycleDays counts 31, 30, 28 and 29-day cycles correctly`
- `a week fully inside a cycle has 7 days inside it`
- `a week spanning a cycle start is split, e.g. 3 days old cycle + 4 days new cycle`
- `a cycle starting on the week's first day puts all 7 days in the new cycle`
- `daysRemainingInCycle counts from the given day to the cycle end, inclusive of that day`
- `cycle boundaries are local midnight across both DST changes` (Europe/Amsterdam, America/New_York)
- `results do not depend on process.env.TZ`

## Implementation tasks
- [ ] Extend `src/core/time/budgetCalendar.ts`
- [ ] `cycleStartDay` in `contributes.configuration` and `parseConfig` (1–31, default 1, invalid → 1 with a warning)

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green

## Depends on
#20, #21

## Labels
`feature`

## Estimate
M

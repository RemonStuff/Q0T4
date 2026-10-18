# 20: Core `BudgetCalendar`: day keys and the week window (time zones, DST)

**Iteration:** 3 (Weekly storage)

## Description
The first level of `BudgetCalendar` ([PLAN §9.2](../PLAN.md#92-two-time-levels-a-monthly-cycle-with-weekly-enforcement)): the enforced **week**. `weekWindow(instant)` returns the local `[start, end)` day keys of the current budget week for `resetDay`. `dayKey(instant)` returns the local calendar day. Both use `Intl.DateTimeFormat` with the IANA zone from `ClockPort.timeZone()`, **never the machine's `TZ`**, so tests give the same results on every CI runner. The week boundary is local midnight at the start of `resetDay`. The billing-cycle level is added to the same class in #54, so keep the API cycle-agnostic.

## Tests to write first
- `monday reset: Sunday 23:59 belongs to the previous week`
- `monday reset: Monday 00:00 starts a new week`
- `resetDay sunday: Saturday 23:59 and Sunday 00:00 fall in different weeks`
- `every resetDay value from monday to sunday yields a start date on that weekday`
- `week spanning the year boundary (Mon 29 Dec 2025 → Sun 4 Jan 2026) has one weekStart`
- `DST spring-forward week (Europe/Amsterdam, 29 Mar 2026) has the correct weekStart`
- `DST fall-back week (America/New_York, 1 Nov 2026) keeps 01:30 on both sides in the same day`
- `the same instant yields different days in Pacific/Kiritimati (+14) and Pacific/Pago_Pago (−11)`
- `dayKey uses the local date, not the UTC date`
- `result does not depend on process.env.TZ` (run with TZ set to two values)

## Implementation tasks
- [ ] `src/core/time/budgetCalendar.ts`: `localParts(instant, tz)`, `weekWindow`, `dayKey`, `addDays(key, n)`, `daysBetween(a, b)`
- [ ] Do the arithmetic on `YYYY-MM-DD` keys (calendar days), not on milliseconds, to avoid DST traps

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green on both ubuntu and windows

## Depends on
#04

## Labels
`feature`

## Estimate
M

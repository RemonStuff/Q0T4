# 22: `BudgetStore` schema v1

**Iteration:** 3 (Weekly storage)

## Description
Persistent weekly usage over `StoragePort`, using the schema in [PLAN §4](../PLAN.md#4-data-model-globalstate): one key per week, `q0t4.usage.v1.<weekStart>`, with per-subject, per-day totals of `input`, `output`, `classifier`, `requests` and `stopped`. Weekly usage is the **sum of day entries inside the current window**. That window can cover two stored week keys, which happens when `resetDay` changed.

## Tests to write first
- `record adds tokens to today's entry for the subject`
- `record creates the week key on first use`
- `record re-reads storage immediately before writing` (InMemoryStorage modified between read and write; neither update is lost)
- `usedThisWeek sums every day in the current window`
- `usedThisWeek is 0 at the start of a new week`
- `usedToday returns only today's entry`
- `usage of other subjects is not counted`
- `classifier tokens count towards used`
- `snapshot returns per-subject used, today and requests for /status`

## Implementation tasks
- [ ] `src/core/storage/budgetStore.ts` with `record`, `usedThisWeek`, `usedToday`, `snapshot`
- [ ] `src/core/storage/schema.ts`: types and the `isWeekRecordV1` guard
- [ ] Inject `ClockPort` and `resetDay`

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green

## Depends on
#20

## Labels
`feature`

## Estimate
M

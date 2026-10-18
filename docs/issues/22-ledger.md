# 22: Core `Ledger`: append-only usage entries and totals

**Iteration:** 3 (Weekly storage)

## Description
Persistent usage as an **append-only ledger** over `LedgerPort`, using the entry schema in [PLAN §4](../PLAN.md#4-data-model-an-append-only-ledger). This replaces the earlier per-week globalState records, which weren't safe with several windows and couldn't hold per-request rate snapshots.

The Ledger builds entries and computes totals for any date range. Weekly, daily and (later) cycle totals are just range queries. Totals are returned in **both units**: tokens always, credits when the entries carry them. This issue covers `usage` and `reset` entries; `untracked`, `budget` and `reserve-grant` arrive with #54–#59.

## Tests to write first
- `record appends a usage entry with subject, day, tokens, model, cost and source`
- `record never rewrites existing entries` (InMemoryLedger sees appends only)
- `usedInRange sums cost for one subject over [from, to)`
- `usedThisWeek sums every entry in the current week window` (with BudgetCalendar from #20)
- `usedThisWeek is 0 at the start of a new week`
- `usedToday returns only today's entries`
- `entries from other subjects are not counted`
- `subjects match case-insensitively, so "remonstuff/q0t4" and "RemonStuff/Q0T4" share one budget`
- `totals are returned in tokens, and in credits when entries carry credit costs`
- `entries from several writers are merged` (InMemoryLedger with two writer streams)
- `a reset marker excludes earlier entries of that subject from this week's total`
- `a reset marker does not affect other subjects or other weeks`
- `subjectsSeen lists every subject with entries in the stored months` (used by /use and /status)

## Implementation tasks
- [ ] `LedgerPort` (`append(entry)`, `read({ from, to })`) and the `LedgerEntry` v1 types and guard (types from #03)
- [ ] `src/core/ledger/ledger.ts` with `record`, `markReset`, `usedInRange`, `usedThisWeek`, `usedToday`, `subjectsSeen`
- [ ] Inject `ClockPort` and `BudgetCalendar`

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green

## Depends on
#20

## Labels
`feature`

## Estimate
M

# 34: `/status` table

**Iteration:** 5 (Visibility)

## Description
`@q0t4 /status` shows a markdown table of every **known subject** (configured, used this week, or the current repo; see #29) with its usage this week, read straight from the `Ledger`. It never calls a model and costs nothing. Amounts are in the active unit.

| Subject | Used | Weekly budget | % | Today | Requests |
|---|---|---|---|---|---|

The reset date goes below the table. Pool columns (monthly share, used this cycle, pace) and the reserve, untracked usage and price-table lines are added in #61.

## Tests to write first
- `renders one row per subject used this week, the current repo first, then by usage descending`
- `includes configured subjects with 0 usage`
- `marks limits that come from defaultLimit as "(default)"`
- `shows used, weekly budget, percent, today and requests in the active unit` (each unit)
- `marks subjects at or above warnAtPercent with ⚠️ and exhausted ones with ⛔`
- `shows 0 for subjects with no usage this week`
- `includes the long reset label below the table`
- `escapes pipe characters in subject names`
- `handler /status does not call the model or record usage`
- `handler /status returns metadata without changing the thread subject`

## Implementation tasks
- [ ] `src/core/format/statusTable.ts`
- [ ] Command branch in `chatHandler`

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green
- [ ] Manual: `@q0t4 /status` renders correctly in the chat panel, in light and dark themes

## Depends on
#33

## Labels
`feature`

## Estimate
S

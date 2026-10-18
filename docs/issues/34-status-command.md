# 34: `/status` table

**Iteration:** 5 (Visibility)

## Description
`@q0t4 /status` shows a markdown table of every **known subject** (configured, used this week, or the current repo; see #29) with its usage this week, read straight from `BudgetStore.snapshot`. It never calls a model and costs no tokens.

| Subject | Used | Limit | % | Today | Requests |
|---|---|---|---|---|---|

The reset date goes below the table.

## Tests to write first
- `renders one row per subject used this week, the current repo first, then by usage descending`
- `includes configured subjects with 0 usage`
- `marks limits that come from defaultWeeklyLimit as "(default)"`
- `shows used, limit, percent, today and requests with compact units`
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

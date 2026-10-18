# 61: Pool-mode footer, `/status` and status bar

**Iteration:** 8 (Pool, reserve and sync)

## Description
Show both time levels and the reserve ([PLAN §9.7](../PLAN.md#97-footer-status-and-status-bar)):
- **Footer:** `*RemonStuff/Q0T4: 2,100 / 3,390 credits this week · month 9,420 / 15,000 · reserve 3,100 · resets Mon · GPT-5*`, plus ⚠️ lines (stale prices, unknown price, borrowed, daily/monthly pace)
- **`/status`:**
  - per subject: weekly budget, used this week, monthly share, used this cycle, pace (×), and whether the share is the default
  - below the table: the reserve (size, borrowed, untracked charged, remaining), untracked usage, pricing-refresh cost (0 in v1), the calibration ratio, the price table's date and source, and the cycle window
- **Status bar:** the current repo's weekly figures, with the cycle figures in the tooltip
- **Without a pool:** everything stays as in #17, #34 and #36

## Tests to write first
- `pool footer shows week, month and reserve figures in that order`
- `pool footer omits the month part for a reserve-backed subject and says "from reserve"`
- `non-pool footer is unchanged` (snapshot from #17)
- `/status has monthly share, cycle used and pace columns in pool mode only`
- `/status shows reserve size, borrowed, untracked and remaining`
- `/status shows the price table date and source in credits mode`
- `/status shows the calibration ratio after a /sync`
- `/status shows pricing-refresh cost as 0`
- `status bar tooltip shows cycle used / share and the reserve`
- `amounts use credits formatting with thousands separators`

## Implementation tasks
- [ ] Extend `core/format/footer.ts`, `statusTable.ts` and `statusBarText.ts`
- [ ] A `StatusSnapshot` builder in core (also reused by the public API in #63)

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green

## Depends on
#34, #36, #57, #58, #59

## Labels
`feature`

## Estimate
M

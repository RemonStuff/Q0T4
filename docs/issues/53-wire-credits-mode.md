# 53: Wire credits mode end to end

**Iteration:** 7 (Live pricing)

## Description
Add `q0t4.budgetUnit` (`"tokens"` default, `"credits"`) and connect the pieces. The composition root picks the `CostModel` from the setting, starts the `PriceRefresher`, and registers the refresh command. Limits (`defaultLimit`, `weeklyLimit`) are read in the active unit.

Footer, `/status` and the status bar show credits ([PLAN §9.7](../PLAN.md#97-footer-status-and-status-bar)). `/status` also shows the price table's date and source and the number of overrides. Stale-price and unknown-price warnings appear after the footer sentinel.

## Tests to write first
*(unit)*
- `budgetUnit defaults to "tokens"; an unknown value warns and uses "tokens"`
- `switching budgetUnit takes effect on the next request without a reload`
- `in credits mode with no price table, the handler refuses with a Refresh Model Prices button and records nothing`
- `in credits mode with a stale table, the footer shows the stale warning and the request still runs`
- `an unknown model's request is costed at the most expensive rates and shows the warning`
- `/status shows the price table date, source and override count in credits mode`

*(integration; fake model provider plus a local price server)*
- `a credits-mode request records an entry with credits, rates and table date in the ledger file`
- `a price change mid-week leaves earlier ledger entries' credits unchanged and only lowers what the remaining budget buys`
- `switching to tokens mode mid-week shows the week's usage in tokens from the same entries`

## Implementation tasks
- [ ] `budgetUnit` in `contributes.configuration` and `parseConfig`
- [ ] Composition-root wiring, plus a test hook for the price source base URL
- [ ] Update `docs/manual-testing.md` (credits section)

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green with a `.vsix` artifact
- [ ] Manual: set `budgetUnit: "credits"` and `defaultLimit: 500`, then chat with a cheap and an expensive model and compare the costs with the docs price page by hand; go offline in a fresh profile and see the first-run refusal

## Depends on
#34, #36, #50, #51, #52

## Labels
`feature`

## Estimate
M

# 51: Core `PriceRefresher`, price settings and the refresh command

**Iteration:** 7 (Live pricing)

## Description
Keep the price table fresh without ever blocking a chat ([PLAN §9.1](../PLAN.md#91-cost-unit-and-live-prices)):
- **When:** fetch on activation, then once a day (timer from `ClockPort`), and on `Q0T4: Refresh Model Prices`.
- **What:** `PriceSourcePort.fetch({ etag })`. `ok` → validate (#49) → save. `unchanged` → bump `checkedAt`. `failed` or invalid → keep the last good table, and log and show one warning.
- **Stale:** `isStale(now)` when `now − fetchedAt > priceMaxAgeHours`. That drives ⚠️ "prices may be out of date (fetched <date>)".
- **First run:** in credits mode with no table, `currentTable()` is `undefined`, and the handler refuses with a "Refresh Model Prices" button. It never guesses.
- **Settings:** `priceSource` (`"auto"` | `"manual"`), `modelPrices` (overrides), `priceMaxAgeHours` (48). With `"manual"`, there's no fetching; the table is built from overrides only.

## Tests to write first
*(FakePriceSource, InMemoryPriceTableStore, FixedClock)*
- `fetches on start when no table is stored`
- `fetches on start and then not again until 24 hours later`
- `passes the stored ETag and keeps the table on "unchanged"`
- `saves a valid new table on "ok"`
- `keeps the last good table when the fetch fails`
- `keeps the last good table when validation fails, and reports the failing check`
- `warns once per failure streak, not on every daily retry`
- `isStale is false at priceMaxAgeHours and true one minute later`
- `the refresh command fetches immediately even if fetched today`
- `currentTable is undefined on first run with no network`
- `manual priceSource never calls the source and builds the table from overrides`
- `overrides are applied on top of a fetched table`
- `invalid modelPrices entries (negative, non-numeric) are dropped with a settings warning`

## Implementation tasks
- [ ] `src/core/pricing/priceRefresher.ts`
- [ ] Price settings in `contributes.configuration` and `parseConfig`
- [ ] Register `q0t4.refreshPrices`

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green

## Depends on
#26, #48, #49

## Labels
`feature`

## Estimate
M

# 48: Core `CreditCostModel`: tiers, rate snapshots and unknown models

**Iteration:** 7 (Live pricing)

## Description
The credits implementation of the `CostModel` interface from #13 ([PLAN §9.1](../PLAN.md#91-cost-unit-and-live-prices)):

```
credits = (inputTokens × inputRate + outputTokens × outputRate) / 1e6 × 100
```

- **Tiers:** pick the *Default* or *Long context* tier from the request's input tokens against the model's threshold (e.g. `≤ 272K`).
- **Cache assumption:** input is costed at `max(input, cache_write)` per tier, because a cache write can cost more than plain input (open question 13).
- **Overrides:** `modelPrices` overrides replace the matching model's rates.
- **Snapshots:** every result carries a `RateSnapshot` (input/output rate, tier, table date and source), so ledger entries are never repriced.
- **Unknown model:** priced at the highest input and the highest output rate in the table, with `unknownPrice: true` for the ⚠️ warning.

## Tests to write first
- `costs input and output at the model's rates: 1M input at $2 and 100k output at $10 is 300 credits`
- `picks the Default tier when input tokens are at the threshold`
- `picks the Long context tier when input tokens exceed the threshold`
- `uses cache_write as the input rate when it is higher than input`
- `uses the input rate when cache_write is "Not applicable"`
- `an override replaces the table's rates for that model`
- `an override can price a model the table doesn't know`
- `an unknown model uses the highest input and output rates in the table and flags unknownPrice`
- `the result carries a rate snapshot with tier, table date and source`
- `costing the same tokens after a table change gives a different cost but the earlier snapshot is unchanged`
- `cost.tokens is always input + output, alongside credits`
- `fractional credits are kept unrounded; rounding is a formatting concern`

## Implementation tasks
- [ ] `src/core/cost/creditCostModel.ts`
- [ ] `PriceTable` lookup helpers (`ratesFor(modelRef, inputTokens)`), using the name matching from #52 once it lands (until then, an exact-name stub)

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green

## Depends on
#13

## Labels
`feature`

## Estimate
M

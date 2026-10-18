# 13: Core `countInput` and the `CostModel` interface

**Iteration:** 2 (Counting and the hard stop)

## Description
Count the tokens of everything we're about to send, by summing `ModelPort.countTokens(message)` over every message (history, references, prompt). Counting happens before the pre-check (#14), so it must respect cancellation and not swallow errors silently.

Raw tokens are then turned into a **cost** by a `CostModel`, so every later step (pre-check, cut-off, recording) works in the active budget unit. This issue introduces the interface and the `TokenCostModel` (cost = tokens). `CreditCostModel` follows in #48.

```ts
interface CostModel {
  readonly unit: BudgetUnit;
  cost(model: ModelRef, tokens: { input: number; output: number }): { cost: Cost; rates?: RateSnapshot };
}
```

## Tests to write first
- `sums countTokens across all messages`
- `returns 0 for an empty message list`
- `counts reference and history messages, not just the prompt`
- `counts messages in parallel but returns a deterministic total`
- `stops and throws a Cancelled error when the signal fires during counting`
- `propagates a countTokens failure as a typed CountError`
- `TokenCostModel cost equals input + output tokens`
- `TokenCostModel has unit "tokens" and returns no rate snapshot`

## Implementation tasks
- [ ] `src/core/budget/countInput.ts`
- [ ] `src/core/cost/tokenCostModel.ts` (the `CostModel` interface already exists in `costModel.ts`, added in #4 for the fixed-rate test double)
- [ ] Add `Cancelled` / `CountError` to `core/errors`

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green

## Depends on
#10

## Labels
`feature`

## Estimate
S

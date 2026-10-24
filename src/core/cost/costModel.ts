import type { BudgetUnit, Cost, ModelRef, RateSnapshot } from "../types";

export interface TokenCounts {
  readonly input: number;
  readonly output: number;
}

export interface CostResult {
  readonly cost: Cost;
  /** The rates used, for the ledger entry; absent in tokens mode. */
  readonly rates?: RateSnapshot;
  /** The model has no price: it was costed at the highest rates, and the user should be told. */
  readonly unknownPrice?: true;
  /** The model is Auto, which hides the real one: the warning should say to pick a model. */
  readonly autoModel?: true;
}

/**
 * Turns raw tokens into a cost in the active budget unit (docs/PLAN.md §9.1).
 * Implementations: `TokenCostModel` (#13) and `CreditCostModel` (#48).
 */
export interface CostModel {
  readonly unit: BudgetUnit;
  cost(model: ModelRef, tokens: TokenCounts): CostResult;
}

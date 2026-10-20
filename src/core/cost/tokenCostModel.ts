import type { ModelRef } from "../types";
import type { CostModel, CostResult, TokenCounts } from "./costModel";

export class TokenCostModel implements CostModel {
  readonly unit = "tokens";

  cost(_model: ModelRef, tokens: TokenCounts): CostResult {
    return { cost: { tokens: tokens.input + tokens.output } };
  }
}

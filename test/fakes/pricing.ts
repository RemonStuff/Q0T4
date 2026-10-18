import type { CostModel, CostResult, TokenCounts } from "../../src/core/cost/costModel";
import type { ModelRef } from "../../src/core/types";
import type { PriceFetchResult, PriceSourcePort } from "../../src/ports/PriceSourcePort";

/** Returns scripted fetch results in order and records the ETag of each call. */
export class FakePriceSource implements PriceSourcePort {
  readonly calls: (string | undefined)[] = [];
  private readonly results: PriceFetchResult[];

  constructor(results: readonly PriceFetchResult[]) {
    this.results = [...results];
  }

  async fetch(previous?: { readonly etag?: string }): Promise<PriceFetchResult> {
    this.calls.push(previous?.etag);
    const next = this.results.shift();
    if (!next) throw new Error("FakePriceSource: no scripted result left");
    return next;
  }
}

/**
 * The credits stand-in for unit-generic tests (docs/PLAN.md §7): every model
 * costs the same fixed USD-per-1M rates.
 */
export class FixedRateCostModel implements CostModel {
  readonly unit = "credits" as const;

  constructor(private readonly rates: { readonly input: number; readonly output: number }) {}

  cost(_model: ModelRef, tokens: TokenCounts): CostResult {
    const usd = (tokens.input * this.rates.input + tokens.output * this.rates.output) / 1e6;
    return {
      cost: { tokens: tokens.input + tokens.output, credits: usd * 100 },
      rates: {
        input: this.rates.input,
        output: this.rates.output,
        tier: "Default",
        tableDate: "fixed",
        tableSource: "fixed-rate-test",
      },
    };
  }
}

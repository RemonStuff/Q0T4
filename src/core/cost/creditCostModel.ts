import { resolvePrice } from "../pricing/matchModel";
import type { PriceTable } from "../pricing/priceTable";
import { inputRate, pickTier } from "../pricing/ratesFor";
import type { ModelRef, PriceOverride } from "../types";
import type { CostModel, CostResult, TokenCounts } from "./costModel";

/** Overrides by model name, family or id; names match case-insensitively. */
export type PriceOverrides = Readonly<Record<string, PriceOverride>>;

const CREDITS_PER_USD = 100;

/**
 * Credits from live prices (docs/PLAN.md §9.1): `(input × inputRate + output × outputRate)
 * / 1e6 × 100`. The tier comes from the request's input size, an override replaces the
 * table's rates, and a model nobody priced costs the highest rates there are, flagged
 * `unknownPrice`. Every result carries the rates it used, so a ledger entry is never repriced.
 */
export class CreditCostModel implements CostModel {
  readonly unit = "credits";
  private readonly highest: { input: number; output: number };

  constructor(
    private readonly table: PriceTable,
    private readonly overrides: PriceOverrides = {},
  ) {
    const prices = Object.values(overrides);
    const inputs = [
      ...table.models.flatMap((model) => model.tiers.map(inputRate)),
      ...prices.map((price) => price.input),
    ];
    const outputs = [
      ...table.models.flatMap((model) => model.tiers.map((tier) => tier.output)),
      ...prices.map((price) => price.output),
    ];
    if (inputs.length === 0) throw new RangeError("CreditCostModel needs at least one price.");
    this.highest = { input: Math.max(...inputs), output: Math.max(...outputs) };
  }

  cost(model: ModelRef, tokens: TokenCounts): CostResult {
    const found = resolvePrice(this.table, model, this.overrides);
    const { input, output, tier } =
      found.kind === "override"
        ? { ...found.price, tier: "Override" }
        : found.kind === "table"
          ? this.tierRates(found.entry.tiers, tokens.input)
          : { ...this.highest, tier: "Unknown" };
    const credits = ((tokens.input * input + tokens.output * output) / 1e6) * CREDITS_PER_USD;
    return {
      cost: { tokens: tokens.input + tokens.output, credits },
      rates: {
        input,
        output,
        tier,
        tableDate: this.table.fetchedAt,
        tableSource: this.table.source,
      },
      ...(found.kind === "unknown" ? { unknownPrice: true as const } : {}),
      ...(found.kind === "unknown" && found.auto === true ? { autoModel: true as const } : {}),
    };
  }

  private tierRates(tiers: Parameters<typeof pickTier>[0], inputTokens: number) {
    const tier = pickTier(tiers, inputTokens);
    return { input: inputRate(tier), output: tier.output, tier: tier.tier };
  }
}

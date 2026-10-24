import { matchModel, normaliseName } from "../pricing/matchModel";
import type { PriceTable } from "../pricing/priceTable";
import { inputRate, pickTier } from "../pricing/ratesFor";
import type { ModelRef } from "../types";
import type { CostModel, CostResult, TokenCounts } from "./costModel";

/** A user's own price for one model (`q0t4.modelPrices`), in USD per 1M tokens. */
export interface PriceOverride {
  readonly input: number;
  readonly output: number;
}

/** Overrides by model name; names match case-insensitively. */
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
  private readonly overrides: Map<string, PriceOverride>;
  private readonly highest: { input: number; output: number };

  constructor(
    private readonly table: PriceTable,
    overrides: PriceOverrides = {},
  ) {
    this.overrides = new Map(
      Object.entries(overrides).map(([name, price]) => [normaliseName(name), price]),
    );
    const inputs = [
      ...table.models.flatMap((model) => model.tiers.map(inputRate)),
      ...[...this.overrides.values()].map((price) => price.input),
    ];
    const outputs = [
      ...table.models.flatMap((model) => model.tiers.map((tier) => tier.output)),
      ...[...this.overrides.values()].map((price) => price.output),
    ];
    if (inputs.length === 0) throw new RangeError("CreditCostModel needs at least one price.");
    this.highest = { input: Math.max(...inputs), output: Math.max(...outputs) };
  }

  cost(model: ModelRef, tokens: TokenCounts): CostResult {
    const { input, output, tier, unknown } = this.ratesFor(model, tokens.input);
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
      ...(unknown ? { unknownPrice: true as const } : {}),
    };
  }

  private ratesFor(model: ModelRef, inputTokens: number) {
    const override = this.overrides.get(normaliseName(model.name));
    if (override !== undefined) return { ...override, tier: "Override", unknown: false };
    const entry = matchModel(this.table, model);
    if (entry === undefined) return { ...this.highest, tier: "Unknown", unknown: true };
    const tier = pickTier(entry.tiers, inputTokens);
    return { input: inputRate(tier), output: tier.output, tier: tier.tier, unknown: false };
  }
}

import { describe, expect, it } from "vitest";
import { CreditCostModel } from "../../../../src/core/cost/creditCostModel";
import type { ModelPrice, PriceTable } from "../../../../src/core/pricing/priceTable";
import type { ModelRef } from "../../../../src/core/types";

const table = (
  models: readonly ModelPrice[],
  overrides = {},
): PriceTable & { overrides?: object } =>
  ({
    fetchedAt: "2026-10-18T06:00:00Z",
    source: "github-docs-yaml",
    models,
    ...overrides,
  }) as PriceTable;

const flat: ModelPrice = {
  model: "GPT-5 mini",
  provider: "OpenAI",
  tiers: [{ tier: "Default", input: 2, output: 10 }],
};
const longContext: ModelPrice = {
  model: "Claude Sonnet 5.5",
  provider: "Anthropic",
  tiers: [
    { tier: "Default", threshold: { op: "lte", tokens: 272_000 }, input: 3, output: 15 },
    { tier: "Long context", threshold: { op: "gt", tokens: 272_000 }, input: 6, output: 22.5 },
  ],
};
const cacheWrite: ModelPrice = {
  model: "Cache Model",
  provider: "Anthropic",
  tiers: [{ tier: "Default", input: 3, cacheWrite: 3.75, output: 15 }],
};
const noCacheWrite: ModelPrice = {
  model: "Plain Model",
  provider: "X",
  tiers: [{ tier: "Default", input: 1, output: 4 }],
};
const expensive: ModelPrice = {
  model: "Most Expensive",
  provider: "X",
  tiers: [{ tier: "Default", input: 30, output: 150 }],
};

const ref = (name: string): ModelRef => ({ name, family: name.toLowerCase().replaceAll(" ", "-") });
const all = table([flat, longContext, cacheWrite, noCacheWrite, expensive]);
const model = (t = all, overrides = {}) => new CreditCostModel(t, overrides);

describe("CreditCostModel", () => {
  it("is the credits unit", () => {
    expect(model().unit).toBe("credits");
  });

  it("costs input and output at the model's rates: 1M input at $2 and 100k output at $10 is 300 credits", () => {
    const { cost } = model().cost(ref("GPT-5 mini"), { input: 1_000_000, output: 100_000 });
    expect(cost.credits).toBeCloseTo(300, 9);
  });

  it("picks the Default tier when input tokens are at the threshold", () => {
    const { rates, cost } = model().cost(ref("Claude Sonnet 5.5"), { input: 272_000, output: 0 });
    expect(rates).toMatchObject({ tier: "Default", input: 3, output: 15 });
    expect(cost.credits).toBeCloseTo((272_000 * 3) / 1e4, 9);
  });

  it("picks the Long context tier when input tokens exceed the threshold", () => {
    const { rates } = model().cost(ref("Claude Sonnet 5.5"), { input: 272_001, output: 0 });
    expect(rates).toMatchObject({ tier: "Long context", input: 6, output: 22.5 });
  });

  it("uses cache_write as the input rate when it is higher than input", () => {
    const { rates, cost } = model().cost(ref("Cache Model"), { input: 1_000_000, output: 0 });
    expect(rates?.input).toBe(3.75);
    expect(cost.credits).toBeCloseTo(375, 9);
  });

  it("uses the input rate when cache_write is not applicable", () => {
    const { rates } = model().cost(ref("Plain Model"), { input: 1_000_000, output: 0 });
    expect(rates?.input).toBe(1);
  });

  it("keeps the input rate when cache_write is lower", () => {
    const lower: ModelPrice = {
      model: "Lower",
      provider: "X",
      tiers: [{ tier: "Default", input: 5, cacheWrite: 2, output: 1 }],
    };
    const { rates } = model(table([lower, expensive])).cost(ref("Lower"), { input: 1, output: 1 });
    expect(rates?.input).toBe(5);
  });

  it("falls back to a tier without a threshold when no threshold matches", () => {
    const odd: ModelPrice = {
      model: "Odd",
      provider: "X",
      tiers: [
        { tier: "Small", threshold: { op: "lte", tokens: 10 }, input: 1, output: 1 },
        { tier: "Any", input: 2, output: 2 },
      ],
    };
    const { rates } = model(table([odd])).cost(ref("Odd"), { input: 100, output: 0 });
    expect(rates?.tier).toBe("Any");
  });

  it("uses the last tier when nothing matches and no tier is unbounded", () => {
    const odd: ModelPrice = {
      model: "Odd",
      provider: "X",
      tiers: [
        { tier: "Small", threshold: { op: "lte", tokens: 10 }, input: 1, output: 1 },
        { tier: "Tiny", threshold: { op: "lte", tokens: 5 }, input: 2, output: 2 },
      ],
    };
    const { rates } = model(table([odd])).cost(ref("Odd"), { input: 100, output: 0 });
    expect(rates?.tier).toBe("Tiny");
  });

  it("matches the model name ignoring case and extra spaces", () => {
    const { rates, unknownPrice } = model().cost(ref("  gpt-5   MINI "), { input: 1, output: 1 });
    expect(rates?.input).toBe(2);
    expect(unknownPrice).toBeUndefined();
  });

  describe("overrides", () => {
    it("replace the table's rates for that model", () => {
      const m = model(all, { "GPT-5 mini": { input: 1, output: 2 } });
      const { rates, cost } = m.cost(ref("GPT-5 mini"), { input: 1_000_000, output: 1_000_000 });
      expect(rates).toMatchObject({ input: 1, output: 2, tier: "Override" });
      expect(cost.credits).toBeCloseTo(300, 9);
    });

    it("can price a model the table doesn't know", () => {
      const m = model(all, { "My Model": { input: 4, output: 8 } });
      const { rates, unknownPrice } = m.cost(ref("my model"), { input: 1, output: 1 });
      expect(rates).toMatchObject({ input: 4, output: 8, tier: "Override" });
      expect(unknownPrice).toBeUndefined();
    });
  });

  describe("an unknown model", () => {
    it("uses the highest input and output rates in the table and flags unknownPrice", () => {
      const { rates, cost, unknownPrice } = model().cost(ref("Nobody"), {
        input: 1_000_000,
        output: 1_000_000,
      });
      expect(unknownPrice).toBe(true);
      expect(rates).toMatchObject({ input: 30, output: 150, tier: "Unknown" });
      expect(cost.credits).toBeCloseTo(18_000, 9);
    });

    it("counts cache_write and every tier when looking for the highest rates", () => {
      const m = model(table([longContext, cacheWrite]));
      const { rates } = m.cost(ref("Nobody"), { input: 1, output: 1 });
      expect(rates).toMatchObject({ input: 6, output: 22.5 });
    });

    it("includes overrides in the highest rates", () => {
      const m = model(table([flat]), { Big: { input: 100, output: 200 } });
      const { rates } = m.cost(ref("Nobody"), { input: 1, output: 1 });
      expect(rates).toMatchObject({ input: 100, output: 200 });
    });

    it("works from overrides alone, as with a manual price source", () => {
      const m = model(table([]), { Big: { input: 7, output: 9 } });
      const { rates } = m.cost(ref("Nobody"), { input: 1, output: 1 });
      expect(rates).toMatchObject({ input: 7, output: 9 });
    });
  });

  it("refuses to be built with no prices at all", () => {
    expect(() => model(table([]))).toThrow(/at least one price/i);
  });

  it("carries a rate snapshot with tier, table date and source", () => {
    const { rates } = model().cost(ref("GPT-5 mini"), { input: 1, output: 1 });
    expect(rates).toEqual({
      input: 2,
      output: 10,
      tier: "Default",
      tableDate: "2026-10-18T06:00:00Z",
      tableSource: "github-docs-yaml",
    });
  });

  it("costing the same tokens after a table change gives a different cost but the earlier snapshot is unchanged", () => {
    const before = model().cost(ref("GPT-5 mini"), { input: 1_000_000, output: 0 });
    const cheaper = table([{ ...flat, tiers: [{ tier: "Default", input: 1, output: 5 }] }]);
    const after = model(cheaper).cost(ref("GPT-5 mini"), { input: 1_000_000, output: 0 });
    expect(before.cost.credits).toBeCloseTo(200, 9);
    expect(after.cost.credits).toBeCloseTo(100, 9);
    expect(before.rates?.input).toBe(2);
  });

  it("cost.tokens is always input + output, alongside credits", () => {
    const { cost } = model().cost(ref("GPT-5 mini"), { input: 123, output: 45 });
    expect(cost.tokens).toBe(168);
  });

  it("keeps fractional credits unrounded", () => {
    const { cost } = model().cost(ref("GPT-5 mini"), { input: 1, output: 1 });
    expect(cost.credits).toBeCloseTo(0.0012, 12);
    expect(cost.credits).not.toBe(Math.round(cost.credits ?? 0));
  });
});

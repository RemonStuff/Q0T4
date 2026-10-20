import { describe, expect, it } from "vitest";
import { costAmount } from "../../../../src/core/cost/costAmount";
import type { BudgetUnit, Cost } from "../../../../src/core/types";

describe("costAmount", () => {
  it("selects only the requested unit without converting or rounding", () => {
    expect(costAmount({ tokens: 900, credits: 0.125 }, "tokens")).toBe(900);
    expect(costAmount({ tokens: 900, credits: 0.125 }, "credits")).toBe(0.125);
    expect(costAmount({ tokens: 0 }, "tokens")).toBe(0);
  });

  it("rejects an absent credit amount rather than treating it as zero", () => {
    expect(() => costAmount({ tokens: 50 }, "credits")).toThrow(TypeError);
  });

  describe.each(["tokens", "credits"] as const)("%s", (unit: BudgetUnit) => {
    it.each([NaN, Infinity, -Infinity, -1])("rejects an invalid amount (%s)", (value) => {
      const cost: Cost = unit === "tokens" ? { tokens: value } : { tokens: 0, credits: value };
      expect(() => costAmount(cost, unit)).toThrow(RangeError);
    });
  });
});

import { describe, expect, it } from "vitest";
import { preCheck } from "../../../../src/core/budget/preCheck";
import type { PreCheckInput } from "../../../../src/core/budget/preCheck";
import type { BudgetUnit, Cost } from "../../../../src/core/types";

describe.each(["tokens", "credits"] as const)("preCheck (%s)", (unit: BudgetUnit) => {
  const cost = (value: number): Cost =>
    unit === "tokens" ? { tokens: value } : { tokens: 0, credits: value };
  const input = (used = 20, estimated = 30, budget = 100): PreCheckInput => ({
    unit,
    used: cost(used),
    input: cost(estimated),
    budget: cost(budget),
  });

  it("allows input below the remaining budget", () => {
    expect(preCheck(input())).toEqual({ allowed: true });
  });

  it("allows input equal to the remaining budget exactly", () => {
    expect(preCheck(input(20, 80))).toEqual({ allowed: true });
  });

  it("refuses input above the remaining budget with Cost-shaped details", () => {
    expect(preCheck(input(20, 81))).toEqual({
      allowed: false,
      used: cost(20),
      budget: cost(100),
      remaining: cost(80),
    });
  });

  it("refuses a zero effective budget even for a zero-cost request", () => {
    expect(preCheck(input(0, 0, 0))).toEqual({
      allowed: false,
      used: cost(0),
      budget: cost(0),
      remaining: cost(0),
    });
  });

  it("refuses existing overshoot and never returns negative remaining amounts", () => {
    expect(preCheck(input(101, 0))).toEqual({
      allowed: false,
      used: cost(101),
      budget: cost(100),
      remaining: cost(0),
    });
  });

  it("allows an extra allowance that covers the gap exactly", () => {
    expect(preCheck({ ...input(90, 20), extraAllowance: cost(10) })).toEqual({
      allowed: true,
    });
  });

  it("allows a zero base budget backed by a positive extra allowance", () => {
    expect(preCheck({ ...input(0, 5, 0), extraAllowance: cost(5) })).toEqual({
      allowed: true,
    });
  });

  it("allows previous base-budget overshoot when extra allowance covers it", () => {
    expect(preCheck({ ...input(105, 5), extraAllowance: cost(10) })).toEqual({
      allowed: true,
    });
  });

  it("uses the same effective budget for refusal and remaining allowance", () => {
    expect(preCheck({ ...input(90, 21), extraAllowance: cost(10) })).toEqual({
      allowed: false,
      used: cost(90),
      budget: cost(110),
      remaining: cost(20),
    });
  });

  it("handles fractional amounts without display rounding", () => {
    expect(preCheck(input(0.25, 0.5, 0.75))).toEqual({ allowed: true });
    expect(preCheck(input(0.25, 0.625, 0.75))).toMatchObject({ allowed: false });
  });

  it("does not grant an epsilon allowance above the limit", () => {
    expect(preCheck(input(0, 1 + Number.EPSILON, 1))).toMatchObject({ allowed: false });
  });

  it("compares only the active unit, not a different unit's limit", () => {
    const small: Cost =
      unit === "tokens" ? { tokens: 1, credits: 900 } : { tokens: 900, credits: 1 };
    const limit: Cost = unit === "tokens" ? { tokens: 2, credits: 1 } : { tokens: 1, credits: 2 };
    expect(preCheck({ unit, used: small, input: small, budget: limit })).toEqual({
      allowed: true,
    });
  });

  it("preserves frozen inputs", () => {
    const used = Object.freeze(cost(90));
    const budget = Object.freeze(cost(100));
    const estimated = Object.freeze(cost(21));
    const extraAllowance = Object.freeze(cost(10));
    const values = Object.freeze({ unit, used, input: estimated, budget, extraAllowance });
    const before = structuredClone(values);

    expect(preCheck(values)).toMatchObject({ allowed: false });
    expect(values).toEqual(before);
  });

  describe.each(["used", "input", "budget", "extraAllowance"] as const)("invalid %s", (field) => {
    it.each([NaN, Infinity, -Infinity, -1])("rejects %s explicitly", (value) => {
      expect(() => preCheck({ ...input(), [field]: cost(value) })).toThrow(RangeError);
    });
  });

  it("rejects invalid supplied amounts in the inactive unit too", () => {
    const used: Cost =
      unit === "tokens" ? { tokens: 0, credits: NaN } : { tokens: NaN, credits: 0 };
    expect(() => preCheck({ ...input(), used })).toThrow(RangeError);
  });

  it("rejects an overflowing effective budget", () => {
    expect(() =>
      preCheck({
        ...input(0, 1, Number.MAX_VALUE),
        extraAllowance: cost(Number.MAX_VALUE),
      }),
    ).toThrow(RangeError);
  });
});

describe("preCheck credit presence", () => {
  it.each(["used", "input", "budget", "extraAllowance"] as const)(
    "does not default missing active credits to zero (%s)",
    (field) => {
      const values: PreCheckInput = {
        unit: "credits",
        used: { tokens: 0, credits: 0 },
        input: { tokens: 1, credits: 1 },
        budget: { tokens: 0, credits: 10 },
        extraAllowance: { tokens: 0, credits: 0 },
      };
      expect(() => preCheck({ ...values, [field]: { tokens: 0 } })).toThrow(TypeError);
    },
  );

  it("does not fabricate unknown inactive credit amounts when adding allowance", () => {
    expect(
      preCheck({
        unit: "tokens",
        used: { tokens: 11, credits: 1 },
        input: { tokens: 2 },
        budget: { tokens: 10, credits: 5 },
        extraAllowance: { tokens: 2 },
      }),
    ).toEqual({
      allowed: false,
      used: { tokens: 11, credits: 1 },
      budget: { tokens: 12 },
      remaining: { tokens: 1 },
    });
  });

  it("preserves known inactive amounts in refusal details", () => {
    expect(
      preCheck({
        unit: "tokens",
        used: { tokens: 9, credits: 2 },
        input: { tokens: 4 },
        budget: { tokens: 10, credits: 3 },
        extraAllowance: { tokens: 2, credits: 1 },
      }),
    ).toEqual({
      allowed: false,
      used: { tokens: 9, credits: 2 },
      budget: { tokens: 12, credits: 4 },
      remaining: { tokens: 3, credits: 2 },
    });
  });
});

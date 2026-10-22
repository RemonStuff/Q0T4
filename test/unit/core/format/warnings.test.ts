import { describe, expect, it } from "vitest";
import { formatWarning } from "../../../../src/core/format/warnings";
import type { BudgetUnit, Cost } from "../../../../src/core/types";

const amount = (unit: BudgetUnit, value: number): Cost =>
  unit === "tokens" ? { tokens: value } : { tokens: 0, credits: value };

describe.each(["tokens", "credits"] as const)("formatWarning (%s)", (unit) => {
  const warn = (used: number, budget = 100, warnAtPercent = 80) =>
    formatWarning({ unit, used: amount(unit, used), budget: amount(unit, budget), warnAtPercent });

  it("adds a warning when weekly usage is at or above warnAtPercent", () => {
    expect(warn(80)).toBe("⚠️ 80% of the weekly budget used.");
    expect(warn(92.9)).toBe("⚠️ 92% of the weekly budget used.");
  });

  it("adds no warning just below warnAtPercent", () => {
    expect(warn(79.99)).toBeNull();
    expect(warn(0)).toBeNull();
  });

  it("shows ⛔ instead of ⚠️ when usage is at or above 100%", () => {
    expect(warn(100)).toBe("⛔ Weekly budget reached.");
    expect(warn(140)).toBe("⛔ Weekly budget reached.");
  });

  it("treats an empty budget as reached", () => {
    expect(warn(0, 0)).toBe("⛔ Weekly budget reached.");
  });

  it("still shows ⛔ at 100% when warnAtPercent is 100", () => {
    expect(warn(99, 100, 100)).toBeNull();
    expect(warn(100, 100, 100)).toBe("⛔ Weekly budget reached.");
  });
});

import { describe, expect, it } from "vitest";
import { formatPaceWarning, formatWarning } from "../../../../src/core/format/warnings";
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

describe.each(["tokens", "credits"] as const)("formatPaceWarning (%s)", (unit) => {
  const label = unit === "credits" ? " credits" : "";

  it("shows today's usage and the threshold in the active unit", () => {
    expect(
      formatPaceWarning({ unit, pace: { usedToday: 61_200, threshold: 60_000, percent: 30 } }),
    ).toBe(
      unit === "tokens"
        ? "⚠️ Daily pace: 62k used today, at least 30% of the weekly budget (60k)."
        : "⚠️ Daily pace: 61,200 credits used today, at least 30% of the weekly budget (60,000 credits).",
    );
    expect(label).toBe(unit === "credits" ? " credits" : "");
  });

  it("rounds used up and the threshold down, so it never contradicts itself", () => {
    const text = formatPaceWarning({
      unit,
      pace: { usedToday: 60_001, threshold: 60_000.9, percent: 30 },
    });
    expect(text).toContain(unit === "tokens" ? "61k used today" : "60,001 credits used today");
    expect(text).toContain(unit === "tokens" ? "(60k)" : "(60,000 credits)");
  });
});

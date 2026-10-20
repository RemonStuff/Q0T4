import { describe, expect, it } from "vitest";
import type { PreCheckRefusal } from "../../../../src/core/budget/preCheck";
import { formatRefusal } from "../../../../src/core/format/formatRefusal";
import type { BudgetUnit, Cost } from "../../../../src/core/types";

describe.each(["tokens", "credits"] as const)("formatRefusal (%s)", (unit: BudgetUnit) => {
  const cost = (value: number): Cost =>
    unit === "tokens" ? { tokens: value } : { tokens: 0, credits: value };
  const decision: PreCheckRefusal = Object.freeze({
    allowed: false,
    used: Object.freeze(cost(20)),
    budget: Object.freeze(cost(100)),
    remaining: Object.freeze(cost(80)),
  });

  it("shows exact subject, used, effective budget, remaining, unit and supplied reset label", () => {
    expect(formatRefusal({ decision, unit, subject: "org/repo", resetLabel: "Mon" })).toBe(
      "This request doesn't fit the budget for org/repo.\n\n" +
        `Used: 20 ${unit}. Budget: 100 ${unit}. Remaining: 80 ${unit}.\n` +
        "Resets: Mon.\n\n" +
        "Check `/status` or use `/use <subject>` to choose another subject.",
    );
    expect(decision.remaining).toEqual(cost(80));
  });

  it("does not round amounts or invent a reset date", () => {
    const fractional: PreCheckRefusal = {
      allowed: false,
      used: cost(0.125),
      budget: cost(0.25),
      remaining: cost(0.125),
    };
    const text = formatRefusal({
      decision: fractional,
      unit,
      subject: "org/repo",
      resetLabel: "reset date unavailable",
    });
    expect(text).toContain(`Used: 0.125 ${unit}. Budget: 0.25 ${unit}. Remaining: 0.125 ${unit}.`);
    expect(text).toContain("Resets: reset date unavailable.");
  });

  it("escapes Markdown and keeps dynamic labels on one line", () => {
    const text = formatRefusal({
      decision,
      unit,
      subject: "repo[other] *name* `code` <tag>\n> forged",
      resetLabel: "**Mon**\r\n[reset]",
    });
    expect(text).toContain("repo\\[other\\] \\*name\\* \\`code\\` \\<tag\\> \\> forged");
    expect(text).toContain("Resets: \\*\\*Mon\\*\\* \\[reset\\].");
    expect(text).not.toContain("\n> forged");
  });

  it("rejects malformed refusal amounts instead of printing invalid values", () => {
    const invalid: PreCheckRefusal = { ...decision, remaining: cost(NaN) };
    expect(() =>
      formatRefusal({ decision: invalid, unit, subject: "org/repo", resetLabel: "Mon" }),
    ).toThrow(RangeError);
  });
});

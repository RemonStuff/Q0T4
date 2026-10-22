import { describe, expect, it } from "vitest";
import { FOOTER_SENTINEL, formatFooter } from "../../../../src/core/format/footer";
import type { FooterInput } from "../../../../src/core/format/footer";
import type { BudgetUnit } from "../../../../src/core/types";

function input(unit: BudgetUnit, overrides: Partial<FooterInput> = {}): FooterInput {
  return unit === "tokens"
    ? {
        subject: "RemonStuff/Q0T4",
        unit,
        used: { tokens: 112_400 },
        budget: { tokens: 150_000 },
        resetLabel: "Mon",
        modelName: "GPT-5",
        ...overrides,
      }
    : {
        subject: "RemonStuff/Q0T4",
        unit,
        used: { tokens: 50_000, credits: 2100.4 },
        budget: { tokens: 0, credits: 3390 },
        resetLabel: "Mon",
        modelName: "GPT-5",
        ...overrides,
      };
}

describe("formatFooter", () => {
  it("exports the hidden sentinel", () => {
    expect(FOOTER_SENTINEL).toBe("<!-- q0t4:footer -->");
  });

  it.each(["tokens", "credits"] as const)(
    "starts with the sentinel and a blank line (%s)",
    (unit) => {
      expect(formatFooter(input(unit)).startsWith(`${FOOTER_SENTINEL}\n\n*`)).toBe(true);
    },
  );

  it("shows subject, used, budget and reset label in tokens", () => {
    expect(formatFooter(input("tokens", { modelName: undefined }))).toBe(
      `${FOOTER_SENTINEL}\n\n*RemonStuff/Q0T4: 113k / 150k this week · resets Mon*`,
    );
  });

  it("shows subject, used, budget, unit label and reset label in credits", () => {
    expect(formatFooter(input("credits", { modelName: undefined }))).toBe(
      `${FOOTER_SENTINEL}\n\n*RemonStuff/Q0T4: 2,101 / 3,390 credits this week · resets Mon*`,
    );
  });

  it.each(["tokens", "credits"] as const)(
    "ends with the model name when a model answered (%s)",
    (unit) => {
      expect(formatFooter(input(unit))).toMatch(/ · resets Mon · GPT\\-5\*$/);
    },
  );

  it.each(["tokens", "credits"] as const)(
    "omits the model part when no model was called (%s)",
    (unit) => {
      const footer = formatFooter(input(unit, { modelName: undefined }));
      expect(footer.endsWith("· resets Mon*")).toBe(true);
      expect(footer).not.toContain("GPT");
    },
  );

  it("rounds used up and the budget down, so the footer never overstates what is left", () => {
    const footer = formatFooter(
      input("tokens", { used: { tokens: 112_001 }, budget: { tokens: 150_999 } }),
    );
    expect(footer).toContain("113k / 150k");
    const credits = formatFooter(
      input("credits", {
        used: { tokens: 1, credits: 7.41 },
        budget: { tokens: 0, credits: 9.99 },
      }),
    );
    expect(credits).toContain("7.5 / 9.9 credits");
  });

  it("escapes markdown special characters in the model name", () => {
    const footer = formatFooter(input("tokens", { modelName: "*bold* [x](http://e.test)\n_y_" }));
    expect(footer).toContain("\\*bold\\* \\[x\\]\\(http://e\\.test\\) \\_y\\_");
    expect(footer.split("\n")).toHaveLength(3);
  });

  it("escapes markdown special characters in subject names and the reset label", () => {
    const footer = formatFooter(input("tokens", { subject: "[a](b)*`", resetLabel: "Mon *1*" }));
    expect(footer).toContain("*\\[a\\]\\(b\\)\\*\\`:");
    expect(footer).toContain("resets Mon \\*1\\*");
  });

  it("rejects a credits footer with a missing credits amount", () => {
    expect(() => formatFooter(input("credits", { used: { tokens: 5 } }))).toThrow(TypeError);
  });
});

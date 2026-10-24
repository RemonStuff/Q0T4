import { describe, expect, it } from "vitest";
import type { ModelPrice, PriceTable } from "../../../../src/core/pricing/priceTable";
import { validateTable } from "../../../../src/core/pricing/validateTable";

const model = (name: string, input: number, output: number, extra = {}): ModelPrice => ({
  model: name,
  provider: "openai",
  tiers: [{ tier: "Default", input, output, ...extra }],
});
const table = (...models: ModelPrice[]): PriceTable => ({
  fetchedAt: "2026-10-24T08:00:00.000Z",
  source: "github-docs-yaml",
  models,
});

const base = table(model("GPT-5 mini", 1, 4), model("Claude Sonnet 5.5", 2, 10));

describe("validateTable", () => {
  it("accepts a good table", () => {
    expect(validateTable(base, undefined, [])).toEqual({ ok: true });
  });

  it("rejects an empty table", () => {
    const result = validateTable(table(), undefined, []);
    expect(result).toEqual({ ok: false, failures: [expect.stringMatching(/no models/i)] });
  });

  it("rejects a model without tiers", () => {
    const result = validateTable(table({ model: "A", provider: "x", tiers: [] }), undefined, []);
    expect(result.ok).toBe(false);
  });

  it("rejects a non-finite or non-numeric rate", () => {
    const bad = table(model("A", Number.NaN, 1));
    expect(validateTable(bad, undefined, []).ok).toBe(false);
    const infinite = table(model("A", 1, Number.POSITIVE_INFINITY));
    expect(validateTable(infinite, undefined, []).ok).toBe(false);
  });

  it.each([0, -1])("rejects a %s rate and names the model", (rate) => {
    const result = validateTable(table(model("GPT-5 mini", rate, 4)), undefined, []);
    expect(result).toMatchObject({ ok: false });
    expect(JSON.stringify(result)).toContain("GPT-5 mini");
    expect(JSON.stringify(result)).toMatch(/positive/);
  });

  it("rejects a zero output rate and a zero optional rate", () => {
    expect(validateTable(table(model("A", 1, 0)), undefined, []).ok).toBe(false);
    expect(validateTable(table(model("A", 1, 1, { cachedInput: 0 })), undefined, []).ok).toBe(
      false,
    );
    expect(validateTable(table(model("A", 1, 1, { cacheWrite: -2 })), undefined, []).ok).toBe(
      false,
    );
  });

  it("rejects a table missing a required model, ignoring case and spacing", () => {
    const result = validateTable(base, undefined, ["gpt-5  MINI", "Claude Opus 9"]);
    expect(result).toEqual({ ok: false, failures: [expect.stringContaining("Claude Opus 9")] });
  });

  it("accepts a table that has all the required models", () => {
    expect(validateTable(base, undefined, ["GPT-5 mini", "claude sonnet 5.5"]).ok).toBe(true);
  });

  describe("change from the previous table", () => {
    const next = (input: number, output = 4) => table(model("GPT-5 mini", input, output));

    it("rejects a rate that changed more than 3× up", () => {
      const result = validateTable(next(3.01), base, []);
      expect(result.ok).toBe(false);
      expect(JSON.stringify(result)).toMatch(/3×/);
      expect(JSON.stringify(result)).toContain("GPT-5 mini");
    });

    it("rejects a rate that changed more than 3× down", () => {
      expect(validateTable(next(1, 1.3), base, []).ok).toBe(false);
    });

    it("accepts a rate change of exactly 3×", () => {
      expect(validateTable(next(3, 12), base, []).ok).toBe(true);
      expect(validateTable(next(1, 4 / 3), base, []).ok).toBe(true);
    });

    it("skips the change check for the first-ever table", () => {
      expect(validateTable(next(1000), undefined, []).ok).toBe(true);
    });

    it("only compares models and tiers present in both tables", () => {
      const added = table(model("Brand New", 500, 900), model("GPT-5 mini", 1, 4));
      expect(validateTable(added, base, []).ok).toBe(true);
      const otherTier = table({
        model: "GPT-5 mini",
        provider: "openai",
        tiers: [{ tier: "Long context", input: 50, output: 90 }],
      });
      expect(validateTable(otherTier, base, []).ok).toBe(true);
    });

    it("does not judge a change against a previous rate that was itself invalid", () => {
      const broken = table(model("GPT-5 mini", 0, 4));
      expect(validateTable(next(100), broken, []).ok).toBe(true);
    });

    it("matches models by normalised name", () => {
      const renamed = table(model("gpt-5   MINI", 100, 4));
      expect(validateTable(renamed, base, []).ok).toBe(false);
    });
  });

  it("reports every failing check at once", () => {
    const result = validateTable(table(model("A", 0, 1)), undefined, ["B"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failures).toHaveLength(2);
  });
});

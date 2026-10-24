import { describe, expect, it } from "vitest";
import {
  matchModel,
  normaliseName,
  resolvePrice,
  slug,
} from "../../../../src/core/pricing/matchModel";
import type { ModelPrice, PriceTable } from "../../../../src/core/pricing/priceTable";
import type { ModelRef } from "../../../../src/core/types";

const entry = (model: string, input = 1): ModelPrice => ({
  model,
  provider: "x",
  tiers: [{ tier: "Default", input, output: input * 4 }],
});
const table = (...models: ModelPrice[]): PriceTable => ({
  fetchedAt: "2026-10-24T09:00:00.000Z",
  source: "github-docs-yaml",
  models,
});
const ref = (name: string, family = "", id?: string): ModelRef => ({
  name,
  family,
  ...(id === undefined ? {} : { id }),
});

describe("normaliseName and slug", () => {
  it("normalise case, spacing and footnotes", () => {
    expect(normaliseName("  GPT-5   Mini ")).toBe("gpt-5 mini");
    expect(normaliseName("Gemini 3.8 Flash[^gemini-flash-promo]")).toBe("gemini 3.8 flash");
  });

  it("slug joins the words with dashes", () => {
    expect(slug("GPT-5 mini")).toBe("gpt-5-mini");
    expect(slug("Claude Sonnet 5.5")).toBe("claude-sonnet-5-5");
    expect(slug("claude-sonnet-5.5")).toBe("claude-sonnet-5-5");
    expect(slug("  --Weird__Name!! ")).toBe("weird-name");
    expect(slug("Claude Opus 4.8 (fast mode) (preview)")).toBe("claude-opus-4-8-fast-mode-preview");
  });
});

describe("matchModel", () => {
  const prices = table(
    entry("GPT-5 mini", 1),
    entry("GPT-5", 2),
    entry("Claude Sonnet 5.5[^promo]", 3),
    entry("Claude Opus 4.8", 4),
  );

  it("matches on display name ignoring case and extra spaces", () => {
    expect(matchModel(prices, ref("  gpt-5   MINI "))?.tiers[0]?.input).toBe(1);
  });

  it("matches a table name with a footnote marker", () => {
    expect(matchModel(prices, ref("Claude Sonnet 5.5"))?.model).toBe("Claude Sonnet 5.5[^promo]");
  });

  it("matches family gpt-5-mini to GPT-5 mini via the slug", () => {
    expect(matchModel(prices, ref("Something Else", "gpt-5-mini"))?.tiers[0]?.input).toBe(1);
    expect(matchModel(prices, ref("Something Else", "claude-sonnet-5.5"))?.tiers[0]?.input).toBe(3);
  });

  it("matches id when family does not match", () => {
    expect(
      matchModel(prices, ref("Something Else", "unrelated", "gpt-5-mini"))?.tiers[0]?.input,
    ).toBe(1);
  });

  it("prefers family over id when both match different models", () => {
    expect(matchModel(prices, ref("Else", "gpt-5", "gpt-5-mini"))?.tiers[0]?.input).toBe(2);
  });

  it("prefers a name match over a slug match for a different model", () => {
    expect(matchModel(prices, ref("GPT-5 mini", "gpt-5"))?.tiers[0]?.input).toBe(1);
  });

  it("returns undefined when nothing matches", () => {
    expect(matchModel(prices, ref("Nobody", "nobody", "nobody"))).toBeUndefined();
    expect(matchModel(prices, ref("Nobody"))).toBeUndefined();
  });

  describe("a (fast mode) (preview) variant", () => {
    const both = table(
      entry("Claude Opus 4.8", 4),
      entry("Claude Opus 4.8 (fast mode) (preview)", 10),
    );

    it("matches its own entry by name and the base by name", () => {
      expect(matchModel(both, ref("Claude Opus 4.8 (fast mode) (preview)"))?.tiers[0]?.input).toBe(
        10,
      );
      expect(matchModel(both, ref("Claude Opus 4.8"))?.tiers[0]?.input).toBe(4);
    });

    it("does not match its base model by family when the table has no entry for the variant", () => {
      const base = table(entry("Claude Opus 4.8", 4));
      expect(
        matchModel(base, ref("Claude Opus 4.8 (fast mode) (preview)", "claude-opus-4.8")),
      ).toBeUndefined();
    });

    it("does not match the variant entry for a plain model by family", () => {
      const fastOnly = table(entry("Claude Opus 4.8 (fast mode) (preview)", 10));
      expect(matchModel(fastOnly, ref("Claude Opus 4.8", "claude-opus-4.8"))).toBeUndefined();
    });
  });
});

describe("resolvePrice", () => {
  const prices = table(entry("GPT-5 mini", 1), entry("Claude Sonnet 5.5", 3));
  const overrides = {
    "GPT-5 mini": { input: 9, output: 9 },
    "claude-sonnet-5.5": { input: 7, output: 7 },
    "some-id": { input: 5, output: 5 },
    Mine: { input: 4, output: 4 },
  };

  it("an override key matches by name", () => {
    expect(resolvePrice(prices, ref("gpt-5 MINI"), overrides)).toMatchObject({
      kind: "override",
      price: { input: 9 },
    });
    expect(resolvePrice(prices, ref("mine"), overrides)).toMatchObject({ kind: "override" });
  });

  it("an override key matches by family", () => {
    expect(
      resolvePrice(prices, ref("Claude Sonnet 5.5", "claude-sonnet-5.5"), overrides),
    ).toMatchObject({
      kind: "override",
      price: { input: 7 },
    });
  });

  it("an override key matches by id", () => {
    expect(resolvePrice(prices, ref("Else", "else", "some-id"), overrides)).toMatchObject({
      kind: "override",
      price: { input: 5 },
    });
  });

  it("an override beats the table for the same model", () => {
    expect(resolvePrice(prices, ref("GPT-5 mini"), overrides).kind).toBe("override");
    expect(resolvePrice(prices, ref("GPT-5 mini"), {}).kind).toBe("table");
  });

  it("uses the table when no override applies", () => {
    const found = resolvePrice(prices, ref("Claude Sonnet 5.5"), {
      other: { input: 1, output: 1 },
    });
    expect(found).toMatchObject({ kind: "table" });
  });

  it("returns unknown when nothing matches", () => {
    expect(resolvePrice(prices, ref("Nobody"), overrides)).toEqual({ kind: "unknown" });
  });

  it('"Auto" is unknown and says so, even if the table had a model with that slug', () => {
    expect(resolvePrice(prices, ref("Auto", "auto"), overrides)).toEqual({
      kind: "unknown",
      auto: true,
    });
    expect(resolvePrice(prices, ref("auto"), {})).toEqual({ kind: "unknown", auto: true });
    expect(resolvePrice(prices, ref("Picked for me", "auto"), {})).toEqual({
      kind: "unknown",
      auto: true,
    });
    expect(resolvePrice(prices, ref("Picked for me", "x", "auto"), {})).toEqual({
      kind: "unknown",
      auto: true,
    });
  });

  it("lets an override price Auto deliberately", () => {
    expect(resolvePrice(prices, ref("Auto", "auto"), { auto: { input: 2, output: 2 } }).kind).toBe(
      "override",
    );
  });
});

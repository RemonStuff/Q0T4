import { describe, expect, it } from "vitest";
import {
  PriceParseError,
  normaliseModelName,
  parsePrice,
  parseThreshold,
} from "../../../../src/core/pricing/normalise";

describe("normaliseModelName", () => {
  it("strips footnote markers and collapses whitespace", () => {
    expect(normaliseModelName("Gemini 3.8 Flash[^gemini-flash-promo]")).toBe("Gemini 3.8 Flash");
    expect(normaliseModelName("  Claude   Sonnet  5.5 ")).toBe("Claude Sonnet 5.5");
    expect(normaliseModelName("A[^x] B[^y]")).toBe("A B");
  });

  it("keeps parentheses and punctuation", () => {
    expect(normaliseModelName("Claude Opus 4.8 (fast mode) (preview)")).toBe(
      "Claude Opus 4.8 (fast mode) (preview)",
    );
  });
});

describe("parsePrice", () => {
  it("parses $ prices", () => {
    expect(parsePrice("$2.50")).toBe(2.5);
    expect(parsePrice("$14.00")).toBe(14);
    expect(parsePrice(" $0.125 ")).toBe(0.125);
    expect(parsePrice("$1,000.00")).toBe(1000);
  });

  it.each(["Not applicable", "not applicable", "", "  ", "-", "—"])(
    "reads %j as not applicable",
    (text) => {
      expect(parsePrice(text)).toBeUndefined();
    },
  );

  it.each(["2.50", "$", "$abc", "$-1", "free", "$1.2.3"])("rejects %j", (text) => {
    expect(() => parsePrice(text)).toThrow(PriceParseError);
  });
});

describe("parseThreshold", () => {
  it("parses ≤ and > with K and M suffixes into token counts", () => {
    expect(parseThreshold("≤ 272K")).toEqual({ op: "lte", tokens: 272_000 });
    expect(parseThreshold("> 272K")).toEqual({ op: "gt", tokens: 272_000 });
    expect(parseThreshold("≤ 1M")).toEqual({ op: "lte", tokens: 1_000_000 });
    expect(parseThreshold("<= 200k")).toEqual({ op: "lte", tokens: 200_000 });
    expect(parseThreshold(">200K")).toEqual({ op: "gt", tokens: 200_000 });
    expect(parseThreshold("> 1.5M")).toEqual({ op: "gt", tokens: 1_500_000 });
    expect(parseThreshold("> 128000")).toEqual({ op: "gt", tokens: 128_000 });
  });

  it.each(["Not applicable", "", "  "])("reads %j as no threshold", (text) => {
    expect(parseThreshold(text)).toBeUndefined();
  });

  it.each(["272K", "≥ 272K", "≤ big", "≤", "≤ 0K"])("rejects %j", (text) => {
    expect(() => parseThreshold(text)).toThrow(PriceParseError);
  });
});

describe("PriceParseError", () => {
  it("carries the line number in its message", () => {
    const error = new PriceParseError("bad value", 12);
    expect(error.line).toBe(12);
    expect(error.message).toBe("line 12: bad value");
    expect(new PriceParseError("bad value").message).toBe("bad value");
    expect(error).toBeInstanceOf(Error);
  });
});

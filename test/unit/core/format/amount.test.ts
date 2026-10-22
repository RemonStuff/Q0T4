import { describe, expect, it } from "vitest";
import { formatAmount, formatCredits, formatTokens } from "../../../../src/core/format/amount";

describe("formatTokens", () => {
  it.each([
    [0, "0"],
    [950, "950"],
    [1000, "1k"],
    [112_400, "112k"],
    [999_999, "999k"],
    [1_000_000, "1M"],
    [1_250_000, "1.25M"],
    [1_500_000, "1.5M"],
    [12_345_678, "12.34M"],
  ])("formats %d as %s", (tokens, text) => {
    expect(formatTokens(tokens)).toBe(text);
  });

  it("rounds down by default and up on request", () => {
    expect(formatTokens(112_900)).toBe("112k");
    expect(formatTokens(112_900, "up")).toBe("113k");
    expect(formatTokens(1_250_001, "up")).toBe("1.26M");
    expect(formatTokens(112_000, "up")).toBe("112k");
    expect(formatTokens(950, "up")).toBe("950");
  });

  it("moves to millions when rounding up reaches 1000k", () => {
    expect(formatTokens(999_001, "up")).toBe("1M");
    expect(formatTokens(999_001)).toBe("999k");
  });
});

describe("formatCredits", () => {
  it.each([
    [0, "0"],
    [5, "5"],
    [7.43, "7.4"],
    [7.99, "7.9"],
    [9.99, "9.9"],
    [10, "10"],
    [10.9, "10"],
    [2100, "2,100"],
    [1_234_567, "1,234,567"],
  ])("formats %d as %s", (credits, text) => {
    expect(formatCredits(credits)).toBe(text);
  });

  it("rounds up on request and never shows a wrong ten", () => {
    expect(formatCredits(7.43, "up")).toBe("7.5");
    expect(formatCredits(7.4, "up")).toBe("7.4");
    expect(formatCredits(9.96, "up")).toBe("10");
    expect(formatCredits(2100.1, "up")).toBe("2,101");
  });

  it("is not thrown off by binary floating point", () => {
    expect(formatCredits(1.1)).toBe("1.1");
    expect(formatCredits(4.35)).toBe("4.3");
    expect(formatCredits(0.3)).toBe("0.3");
    expect(formatCredits(0.3, "up")).toBe("0.3");
  });
});

describe("formatAmount", () => {
  it("reads the amount in the active unit", () => {
    expect(formatAmount({ tokens: 112_400, credits: 7.43 }, "tokens")).toBe("112k");
    expect(formatAmount({ tokens: 112_400, credits: 7.43 }, "credits")).toBe("7.4");
  });

  it("rejects a missing credits amount rather than inventing zero", () => {
    expect(() => formatAmount({ tokens: 10 }, "credits")).toThrow(TypeError);
  });
});

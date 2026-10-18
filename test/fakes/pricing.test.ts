import { describe, expect, it } from "vitest";
import type { PriceTable } from "../../src/core/pricing/priceTable";
import { FakePriceSource, FixedRateCostModel } from "./index";

const table: PriceTable = {
  fetchedAt: "2026-10-18T06:00:00Z",
  source: "github-docs-yaml",
  models: [],
};

describe("FakePriceSource", () => {
  it("FakePriceSource returns scripted results in order: ok, unchanged, failed", async () => {
    const source = new FakePriceSource([
      { status: "ok", table, etag: '"v1"' },
      { status: "unchanged" },
      { status: "failed", reasons: ["offline"] },
    ]);
    expect(await source.fetch()).toEqual({ status: "ok", table, etag: '"v1"' });
    expect(await source.fetch()).toEqual({ status: "unchanged" });
    expect(await source.fetch()).toEqual({ status: "failed", reasons: ["offline"] });
    await expect(source.fetch()).rejects.toThrow(/no scripted result/);
  });

  it("FakePriceSource records the ETag it was called with", async () => {
    const source = new FakePriceSource([{ status: "unchanged" }, { status: "unchanged" }]);
    await source.fetch();
    await source.fetch({ etag: '"v1"' });
    expect(source.calls).toEqual([undefined, '"v1"']);
  });
});

describe("FixedRateCostModel", () => {
  const model = { name: "GPT-5 mini", family: "gpt-5-mini" };

  it("costs input and output at the configured USD-per-1M rates in credits", () => {
    const costModel = new FixedRateCostModel({ input: 2, output: 10 });
    expect(costModel.unit).toBe("credits");
    // (1M × $2 + 100k × $10) / 1M × 100 credits per dollar = 300 credits
    expect(costModel.cost(model, { input: 1_000_000, output: 100_000 }).cost).toEqual({
      tokens: 1_100_000,
      credits: 300,
    });
  });

  it("returns a rate snapshot naming the fixed table", () => {
    const { rates } = new FixedRateCostModel({ input: 1, output: 2 }).cost(model, {
      input: 10,
      output: 10,
    });
    expect(rates).toEqual({
      input: 1,
      output: 2,
      tier: "Default",
      tableDate: "fixed",
      tableSource: "fixed-rate-test",
    });
  });
});

import { describe, expect, it } from "vitest";
import { isPriceTable } from "../../../../src/core/pricing/priceTable";

const good = {
  fetchedAt: "2026-10-24T09:00:00.000Z",
  source: "manual",
  models: [
    {
      model: "A",
      provider: "x",
      tiers: [
        {
          tier: "Default",
          threshold: { op: "gt", tokens: 5 },
          input: 1,
          cachedInput: 0.1,
          cacheWrite: 1.25,
          output: 2,
        },
      ],
    },
  ],
};

describe("isPriceTable", () => {
  it("accepts a full table and one with the optional fields left out", () => {
    expect(isPriceTable(good)).toBe(true);
    expect(isPriceTable({ ...good, etag: '"e"', models: [] })).toBe(true);
    expect(
      isPriceTable({
        ...good,
        models: [{ model: "A", provider: "x", tiers: [{ tier: "D", input: 1, output: 2 }] }],
      }),
    ).toBe(true);
  });

  it.each([
    ["null", null],
    ["a string", "table"],
    ["no fetchedAt", { ...good, fetchedAt: undefined }],
    ["an unknown source", { ...good, source: "web" }],
    ["a non-string etag", { ...good, etag: 1 }],
    ["models not an array", { ...good, models: {} }],
    ["a model without a name", { ...good, models: [{ provider: "x", tiers: [] }] }],
    ["a model without tiers", { ...good, models: [{ model: "A", provider: "x" }] }],
    ["a non-object tier", { ...good, models: [{ model: "A", provider: "x", tiers: [1] }] }],
    [
      "a tier without a name",
      { ...good, models: [{ model: "A", provider: "x", tiers: [{ input: 1, output: 1 }] }] },
    ],
    [
      "a tier without an output",
      { ...good, models: [{ model: "A", provider: "x", tiers: [{ tier: "D", input: 1 }] }] },
    ],
    [
      "a string rate",
      {
        ...good,
        models: [{ model: "A", provider: "x", tiers: [{ tier: "D", input: "1", output: 1 }] }],
      },
    ],
    [
      "a bad optional rate",
      {
        ...good,
        models: [
          {
            model: "A",
            provider: "x",
            tiers: [{ tier: "D", input: 1, output: 1, cacheWrite: "x" }],
          },
        ],
      },
    ],
    [
      "a bad threshold",
      {
        ...good,
        models: [
          {
            model: "A",
            provider: "x",
            tiers: [{ tier: "D", input: 1, output: 1, threshold: { op: "eq", tokens: 1 } }],
          },
        ],
      },
    ],
    [
      "a threshold without tokens",
      {
        ...good,
        models: [
          {
            model: "A",
            provider: "x",
            tiers: [{ tier: "D", input: 1, output: 1, threshold: { op: "gt" } }],
          },
        ],
      },
    ],
  ])("rejects %s", (_name, value) => {
    expect(isPriceTable(value)).toBe(false);
  });
});

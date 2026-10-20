import { describe, expect, it } from "vitest";
import type { CostModel } from "../../../../src/core/cost/costModel";
import { TokenCostModel } from "../../../../src/core/cost/tokenCostModel";
import type { ModelRef } from "../../../../src/core/types";

const model: ModelRef = Object.freeze({ name: "Fake Model", family: "fake", id: "fake" });

describe("TokenCostModel", () => {
  it.each([
    [0, 0, 0],
    [12, 0, 12],
    [0, 8, 8],
    [12, 8, 20],
    [123_456, 789, 124_245],
  ])("costs %i input + %i output tokens as %i tokens", (input, output, total) => {
    const costModel: CostModel = new TokenCostModel();

    expect(costModel.cost(model, { input, output })).toEqual({ cost: { tokens: total } });
  });

  it("uses the tokens unit and omits credits and rate snapshots", () => {
    const costModel: CostModel = new TokenCostModel();
    const result = costModel.cost(model, { input: 3, output: 5 });

    expect(costModel.unit).toBe("tokens");
    expect(result).not.toHaveProperty("rates");
    expect(result.cost).not.toHaveProperty("credits");
  });

  it("does not mutate the model or counts, and does not depend on model identity", () => {
    const costModel = new TokenCostModel();
    const tokens = Object.freeze({ input: 11, output: 7 });

    expect(costModel.cost(model, tokens)).toEqual({ cost: { tokens: 18 } });
    expect(costModel.cost({ name: "Another Model", family: "another" }, tokens)).toEqual({
      cost: { tokens: 18 },
    });
    expect(tokens).toEqual({ input: 11, output: 7 });
    expect(model).toEqual({ name: "Fake Model", family: "fake", id: "fake" });
  });
});

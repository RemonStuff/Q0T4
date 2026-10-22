import { describe, expect, it, vi } from "vitest";
import { chatHandler } from "../../../../src/core/chatHandler";
import type { BudgetContext, ChatHandlerRequest, Deps } from "../../../../src/core/chatHandler";
import { TokenCostModel } from "../../../../src/core/cost/tokenCostModel";
import { isResultMetadata } from "../../../../src/core/types";
import type { BudgetUnit, Cost } from "../../../../src/core/types";
import {
  FakeCancellation,
  FakeModel,
  FakeModelSelector,
  FakeReferenceReader,
  FixedRateCostModel,
  RecordingOutput,
} from "../../../fakes";
import type { FakeModelOptions } from "../../../fakes";

// FakeModel: one token per 4 characters. The credit model prices one token at 1 credit.
function fixture(unit: BudgetUnit, options: FakeModelOptions = {}, limit = 10_000) {
  const amount = (value: number): Cost =>
    unit === "tokens" ? { tokens: value } : { tokens: 0, credits: value };
  const model = new FakeModel({
    name: "GPT-5",
    chunks: ["abcd", "efgh", "ijkl"],
    countTokens: (text) => text.length / 4,
    ...options,
  });
  const signal = new FakeCancellation();
  const budget: BudgetContext = {
    subject: "org/repo",
    used: amount(0),
    budget: amount(limit),
    resetLabel: "Mon",
    costModel:
      unit === "tokens"
        ? new TokenCostModel()
        : new FixedRateCostModel({ input: 10_000, output: 10_000 }),
  };
  const request: ChatHandlerRequest = { prompt: "1234", history: [], model };
  const deps: Deps = {
    selector: new FakeModelSelector([]),
    referenceReader: new FakeReferenceReader(),
    output: new RecordingOutput(),
    signal,
    budget,
  };
  return { model, signal, request, deps };
}

describe.each(["tokens", "credits"] as const)("handler metadata (%s)", (unit) => {
  const cost = (tokens: number) =>
    unit === "tokens" ? { tokens } : { tokens, credits: expect.closeTo(tokens, 5) as unknown };

  it("returns subject, model, unit, tokens, cost and stopped after a normal reply", async () => {
    const { request, deps } = fixture(unit);
    const { metadata } = await chatHandler(request, deps);
    expect(metadata).toMatchObject({
      v: 1,
      outcome: "completed",
      subject: "org/repo",
      model: "GPT-5",
      unit,
      inputTokens: 1,
      outputTokens: 3,
      cost: cost(4),
      stopped: false,
    });
    expect(isResultMetadata(metadata)).toBe(true);
    expect(JSON.parse(JSON.stringify(metadata))).toEqual(metadata);
  });

  it("names the model that answered", async () => {
    const { request, deps } = fixture(unit, { name: "Claude Sonnet 5.5" });
    const { metadata } = await chatHandler(request, deps);
    expect(metadata).toMatchObject({ model: "Claude Sonnet 5.5" });
  });

  it("reports the cost in the active unit", async () => {
    const { request, deps } = fixture(unit);
    const { metadata } = await chatHandler(request, deps);
    if (!("cost" in metadata) || metadata.cost === undefined) throw new Error("no cost");
    expect(metadata.cost.tokens).toBe(4);
    if (unit === "credits") expect(metadata.cost.credits).toBeCloseTo(4);
    else expect(metadata.cost).not.toHaveProperty("credits");
  });

  it('sets stopped to "budget" after a cut-off', async () => {
    const { request, deps } = fixture(unit, {}, 3);
    const { metadata } = await chatHandler(request, deps);
    expect(metadata).toMatchObject({
      outcome: "stopped",
      stopped: "budget",
      inputTokens: 1,
      outputTokens: 2,
      cost: cost(3),
    });
    expect(isResultMetadata(metadata)).toBe(true);
  });

  it('sets stopped to "cancelled" after a user cancel, with the tokens used so far', async () => {
    const { request, deps, model, signal } = fixture(unit);
    async function* stream() {
      yield "abcd";
      signal.cancel();
      yield "efgh";
    }
    vi.spyOn(model, "sendRequest").mockResolvedValue(stream());
    const { metadata } = await chatHandler(request, deps);
    expect(metadata).toMatchObject({
      outcome: "cancelled",
      stopped: "cancelled",
      inputTokens: 1,
      outputTokens: 1,
      cost: cost(2),
    });
    expect(isResultMetadata(metadata)).toBe(true);
  });

  it('sets stopped to "precheck" and charges nothing when the pre-check refuses', async () => {
    const { request, deps } = fixture(unit, {}, 0);
    const { metadata } = await chatHandler(request, deps);
    expect(metadata).toMatchObject({
      outcome: "refused",
      stopped: "precheck",
      inputTokens: 0,
      outputTokens: 0,
      cost: unit === "tokens" ? { tokens: 0 } : { tokens: 0, credits: 0 },
    });
    expect(metadata).not.toHaveProperty("model");
    expect(isResultMetadata(metadata)).toBe(true);
  });

  it("charges nothing when sendRequest rejects before streaming", async () => {
    const { request, deps } = fixture(unit, { failBeforeFirstChunk: new Error("no") });
    const { metadata } = await chatHandler(request, deps);
    expect(metadata).toMatchObject({
      outcome: "error",
      model: "GPT-5",
      stopped: false,
      inputTokens: 0,
      outputTokens: 0,
    });
    expect(isResultMetadata(metadata)).toBe(true);
  });

  it("charges input and output so far when the stream fails mid-way", async () => {
    const { request, deps } = fixture(unit, {
      failAfterChunk: { after: 2, error: new Error("boom") },
    });
    const { metadata } = await chatHandler(request, deps);
    expect(metadata).toMatchObject({
      outcome: "error",
      stopped: false,
      inputTokens: 1,
      outputTokens: 2,
    });
    expect(isResultMetadata(metadata)).toBe(true);
  });

  it("is valid metadata when no model is available", async () => {
    const { request, deps } = fixture(unit);
    const { metadata } = await chatHandler(request, {
      ...deps,
      selector: new FakeModelSelector([]),
    });
    expect(isResultMetadata(metadata)).toBe(true);
  });
});

describe("handler metadata without a budget context", () => {
  it("keeps the plain outcome metadata", async () => {
    const { request, deps } = fixture("tokens");
    const { budget: _budget, ...withoutBudget } = deps;
    expect((await chatHandler(request, withoutBudget)).metadata).toEqual({
      outcome: "completed",
      model: "GPT-5",
    });
  });
});

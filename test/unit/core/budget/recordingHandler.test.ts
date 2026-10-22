import { describe, expect, it, vi } from "vitest";
import { chatHandler } from "../../../../src/core/chatHandler";
import type {
  BudgetContext,
  ChatHandlerRequest,
  Deps,
  RecordingContext,
} from "../../../../src/core/chatHandler";
import { TokenCostModel } from "../../../../src/core/cost/tokenCostModel";
import type { BudgetUnit, Cost } from "../../../../src/core/types";
import {
  FakeCancellation,
  FakeModel,
  FakeModelSelector,
  FakeReferenceReader,
  FixedClock,
  FixedRateCostModel,
  InMemoryUsageSink,
  RecordingOutput,
} from "../../../fakes";
import type { FakeModelOptions } from "../../../fakes";

// FakeModel counts one token per 4 characters; the credit model prices a token at 1 credit.
function fixture(unit: BudgetUnit, options: FakeModelOptions = {}, limit = 10_000) {
  const amount = (value: number): Cost =>
    unit === "tokens" ? { tokens: value } : { tokens: 0, credits: value };
  const model = new FakeModel({
    chunks: ["abcd", "efgh", "ijkl"],
    countTokens: (text) => text.length / 4,
    ...options,
  });
  const signal = new FakeCancellation();
  const output = new RecordingOutput();
  const sink = new InMemoryUsageSink();
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
  const errors: unknown[] = [];
  const recording: RecordingContext = {
    sink,
    clock: new FixedClock("2026-10-14T09:12:03.120Z"),
    newId: () => "entry-1",
    onError: (error) => errors.push(error),
  };
  const request: ChatHandlerRequest = { prompt: "1234", history: [], model };
  const deps: Deps = {
    selector: new FakeModelSelector([]),
    referenceReader: new FakeReferenceReader(),
    output,
    signal,
    budget,
    recording,
  };
  return { model, signal, output, sink, errors, request, deps, amount };
}

describe.each(["tokens", "credits"] as const)("recording in chatHandler (%s)", (unit) => {
  it("records input and output on success, with the output recounted from the reply", async () => {
    const { request, deps, sink, model } = fixture(unit);
    expect(await chatHandler(request, deps)).toEqual({
      metadata: { outcome: "completed", model: model.name },
    });
    expect(sink.entries).toHaveLength(1);
    expect(sink.entries[0]).toMatchObject({
      kind: "usage",
      subject: "org/repo",
      source: "q0t4",
      model: { name: model.name, family: model.family },
      tokens: { input: 1, output: 3 },
      cost: { tokens: 4 },
      stopped: false,
    });
    expect(model.calls.countTokens).toContain("abcdefghijkl");
  });

  it("records input and output so far when the user cancels, recounting after cancellation", async () => {
    const { request, deps, sink, model, signal } = fixture(unit);
    async function* stream() {
      yield "abcd";
      signal.cancel();
      yield "efgh";
    }
    vi.spyOn(model, "sendRequest").mockResolvedValue(stream());
    expect(await chatHandler(request, deps)).toEqual({
      metadata: { outcome: "cancelled", model: model.name },
    });
    expect(sink.entries).toHaveLength(1);
    expect(sink.entries[0]).toMatchObject({ tokens: { input: 1, output: 1 }, stopped: true });
    const entry = sink.entries[0];
    if (entry?.kind !== "usage") throw new Error("expected a usage entry");
    expect(entry.cost.tokens).toBe(2);
    if (unit === "credits") expect(entry.cost.credits).toBeCloseTo(2);
  });

  it("records input and output so far when the stream throws mid-way", async () => {
    const { request, deps, sink, model, output } = fixture(unit, {
      failAfterChunk: { after: 2, error: new Error("boom") },
    });
    expect(await chatHandler(request, deps)).toEqual({
      metadata: { outcome: "error", model: model.name },
    });
    expect(output.text).toContain("abcdefgh");
    expect(sink.entries).toHaveLength(1);
    expect(sink.entries[0]).toMatchObject({ tokens: { input: 1, output: 2 }, stopped: false });
  });

  it("records input and output when StreamGuard stops the reply", async () => {
    const { request, deps, sink, model } = fixture(unit, {}, 3);
    expect(await chatHandler(request, deps)).toEqual({
      metadata: { outcome: "stopped", stopped: "budget", model: model.name },
    });
    expect(sink.entries).toHaveLength(1);
    expect(sink.entries[0]).toMatchObject({ tokens: { input: 1, output: 2 }, stopped: true });
  });

  it("records nothing for the model call when sendRequest rejects before streaming", async () => {
    const { request, deps, sink, model } = fixture(unit, {
      failBeforeFirstChunk: new Error("no"),
    });
    expect(await chatHandler(request, deps)).toEqual({
      metadata: { outcome: "error", model: model.name },
    });
    expect(sink.entries).toEqual([]);
  });

  it("records nothing when the pre-check refuses", async () => {
    const { request, deps, sink, model } = fixture(unit, {}, 0);
    expect(await chatHandler(request, deps)).toEqual({
      metadata: { outcome: "refused", stopped: "precheck" },
    });
    expect(sink.entries).toEqual([]);
    expect(model.calls.sendRequest).toEqual([]);
  });

  it("records nothing when the request is cancelled before the model is called", async () => {
    const { request, deps, sink, signal } = fixture(unit);
    signal.cancel();
    await chatHandler(request, deps);
    expect(sink.entries).toEqual([]);
  });

  it("reports a failed write instead of throwing, and leaves the reply and result alone", async () => {
    for (const fail of ["reject", "throw"] as const) {
      const { request, deps, sink, output, model, errors } = fixture(unit);
      sink.fail = fail;
      expect(await chatHandler(request, deps)).toEqual({
        metadata: { outcome: "completed", model: model.name },
      });
      expect(output.text).toBe("abcdefghijkl");
      expect(errors).toHaveLength(1);
      expect(errors[0]).toBeInstanceOf(Error);
    }
  });

  it("survives a failed write when there is no error hook, or the hook itself throws", async () => {
    for (const hook of ["missing", "throws"] as const) {
      const { request, deps, sink, model } = fixture(unit);
      sink.fail = "reject";
      const { onError: _hook, ...recording } = deps.recording as RecordingContext;
      const hooked: RecordingContext =
        hook === "missing"
          ? recording
          : {
              ...recording,
              onError: () => {
                throw new Error("hook failed");
              },
            };
      expect(await chatHandler(request, { ...deps, recording: hooked })).toEqual({
        metadata: { outcome: "completed", model: model.name },
      });
    }
  });

  it("still records the exact count so far when the final recount fails", async () => {
    const { request, deps, sink, model, signal } = fixture(unit);
    async function* stream() {
      yield "abcd";
      signal.cancel();
      yield "efgh";
    }
    vi.spyOn(model, "sendRequest").mockResolvedValue(stream());
    const original = model.countTokens.bind(model);
    vi.spyOn(model, "countTokens").mockImplementation((input) =>
      typeof input === "string" ? Promise.reject(new Error("tokenizer down")) : original(input),
    );
    await chatHandler(request, deps);
    expect(sink.entries).toHaveLength(1);
    expect(sink.entries[0]).toMatchObject({ tokens: { input: 1, output: 0 } });
  });
});

describe("recording in chatHandler (contents)", () => {
  it("takes id, instant and day from the injected newId and clock", async () => {
    const { request, deps, sink } = fixture("tokens");
    await chatHandler(request, deps);
    expect(sink.entries[0]).toMatchObject({
      id: "entry-1",
      at: "2026-10-14T09:12:03.120Z",
      day: "2026-10-14",
    });
  });

  it("carries the rate snapshot in credits mode and none in tokens mode", async () => {
    const credits = fixture("credits");
    await chatHandler(credits.request, credits.deps);
    expect(credits.sink.entries[0]).toMatchObject({ rates: { tableSource: "fixed-rate-test" } });
    const tokens = fixture("tokens");
    await chatHandler(tokens.request, tokens.deps);
    expect(tokens.sink.entries[0]).not.toHaveProperty("rates");
  });

  it("records nothing without a budget context, because there is no cost model", async () => {
    const { request, deps, sink } = fixture("tokens");
    const { budget: _budget, ...withoutBudget } = deps;
    await chatHandler(request, withoutBudget);
    expect(sink.entries).toEqual([]);
  });

  it("works without a recording context", async () => {
    const { request, deps, model } = fixture("tokens");
    const { recording: _recording, ...withoutRecording } = deps;
    expect(await chatHandler(request, withoutRecording)).toEqual({
      metadata: { outcome: "completed", model: model.name },
    });
  });
});

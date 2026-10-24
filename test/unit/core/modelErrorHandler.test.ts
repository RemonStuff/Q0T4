import { describe, expect, it, vi } from "vitest";
import { chatHandler } from "../../../src/core/chatHandler";
import type {
  BudgetContext,
  ChatHandlerRequest,
  Deps,
  RecordingContext,
} from "../../../src/core/chatHandler";
import { TokenCostModel } from "../../../src/core/cost/tokenCostModel";
import { ModelError } from "../../../src/core/errors/modelErrors";
import {
  FakeCancellation,
  FakeModel,
  FakeModelSelector,
  FakeReferenceReader,
  FixedClock,
  InMemoryUsageSink,
  RecordingOutput,
} from "../../fakes";
import type { FakeModelOptions } from "../../fakes";

const CONSENT = "Q0T4 needs permission to use Copilot models. Accept the prompt and try again.";
const QUOTA = "Copilot reports a quota or rate limit. Try again later.";
const NO_MODEL = "No Copilot chat model is available. Check that GitHub Copilot is signed in.";
const GENERIC = "Q0T4 couldn't complete this request. Please try again.";

function copilot(options: FakeModelOptions = {}): FakeModel {
  return new FakeModel({ vendor: "copilot", chunks: ["abcd", "efgh"], ...options });
}

function fixture(
  options: FakeModelOptions = {},
  fallbacks: readonly FakeModel[] = [],
  withBudget = true,
) {
  const model = copilot({ id: "first", name: "First Model", ...options });
  const selector = new FakeModelSelector([model, ...fallbacks]);
  const output = new RecordingOutput();
  const signal = new FakeCancellation();
  const sink = new InMemoryUsageSink();
  const budget: BudgetContext = {
    subject: "org/repo",
    used: { tokens: 0 },
    budget: { tokens: 10_000 },
    resetLabel: "Mon",
    costModel: new TokenCostModel(),
  };
  const recording: RecordingContext = {
    sink,
    clock: new FixedClock("2026-10-14T09:12:03.120Z"),
    newId: () => "entry-1",
  };
  const request: ChatHandlerRequest = { prompt: "1234", history: [], model };
  const deps: Deps = {
    selector,
    referenceReader: new FakeReferenceReader(),
    output,
    signal,
    footer: { warnAtPercent: 80 },
    ...(withBudget ? { budget, recording } : {}),
  };
  return { model, selector, output, sink, request, deps };
}

describe("NoPermissions", () => {
  const error = new ModelError("noPermissions", "denied");

  it("before streaming shows the consent message and records nothing", async () => {
    const { request, deps, output, sink, model } = fixture({ failBeforeFirstChunk: error });
    const result = await chatHandler(request, deps);
    expect(output.text).toContain(CONSENT);
    expect(result.metadata).toMatchObject({ outcome: "error", model: model.name });
    expect(sink.entries).toEqual([]);
    expect(result.metadata).toMatchObject({ inputTokens: 0, outputTokens: 0 });
  });

  it("never retries with a fallback model", async () => {
    const fallback = copilot({ id: "second", name: "Second Model" });
    const { request, deps, model } = fixture({ failBeforeFirstChunk: error }, [fallback]);
    await chatHandler(request, deps);
    expect(model.calls.sendRequest).toHaveLength(1);
    expect(fallback.calls.sendRequest).toHaveLength(0);
  });
});

describe("NotFound", () => {
  const error = new ModelError("notFound", "model gone");

  it("retries once with the fallback copilot model and succeeds", async () => {
    const fallback = copilot({ id: "second", name: "Second Model", chunks: ["ok"] });
    const { request, deps, output, model } = fixture({ failBeforeFirstChunk: error }, [fallback]);
    const result = await chatHandler(request, deps);
    expect(model.calls.sendRequest).toHaveLength(1);
    expect(fallback.calls.sendRequest).toHaveLength(1);
    expect(output.text).toContain("ok");
    expect(output.text).not.toContain(GENERIC);
    expect(result.metadata).toMatchObject({ outcome: "completed" });
  });

  it("sends the same messages to the fallback", async () => {
    const fallback = copilot({ id: "second", name: "Second Model" });
    const { request, deps, model } = fixture({ failBeforeFirstChunk: error }, [fallback]);
    await chatHandler(request, deps);
    expect(fallback.calls.sendRequest[0]).toEqual(model.calls.sendRequest[0]);
  });

  it("prefers a fallback from the same family", async () => {
    const other = copilot({ id: "other", name: "Other", family: "other-family" });
    const same = copilot({ id: "same", name: "Same", family: "fake-family" });
    const { request, deps } = fixture({ failBeforeFirstChunk: error }, [other, same]);
    await chatHandler(request, deps);
    expect(same.calls.sendRequest).toHaveLength(1);
    expect(other.calls.sendRequest).toHaveLength(0);
  });

  it("names the fallback model, not the original, in the footer, metadata and ledger", async () => {
    const fallback = copilot({ id: "second", name: "Second Model" });
    const { request, deps, output, sink } = fixture({ failBeforeFirstChunk: error }, [fallback]);
    const result = await chatHandler(request, deps);
    expect(result.metadata).toMatchObject({ model: "Second Model" });
    expect(output.text).toContain("Second Model");
    expect(output.text).not.toContain("First Model");
    expect(sink.entries).toHaveLength(1);
    expect(sink.entries[0]).toMatchObject({ model: { name: "Second Model" } });
  });

  it("counts and charges the fallback's input, nothing for the rejected request", async () => {
    const fallback = copilot({ id: "second", name: "Second Model" });
    const { request, deps, sink } = fixture({ failBeforeFirstChunk: error }, [fallback]);
    await chatHandler(request, deps);
    expect(sink.entries).toHaveLength(1);
    expect(fallback.calls.countTokens.length).toBeGreaterThan(0);
  });

  it("shows the no-model message when there is no fallback", async () => {
    const { request, deps, output, sink } = fixture({ failBeforeFirstChunk: error });
    const result = await chatHandler(request, deps);
    expect(output.text).toContain(NO_MODEL);
    expect(output.text).not.toContain(GENERIC);
    expect(result.metadata).toMatchObject({ outcome: "noModel" });
    expect(sink.entries).toEqual([]);
  });

  it("does not offer the model that was just not found as its own fallback", async () => {
    const { request, deps, model } = fixture({ failBeforeFirstChunk: error });
    await chatHandler(request, deps);
    expect(model.calls.sendRequest).toHaveLength(1);
  });

  it("does not retry more than once", async () => {
    const second = copilot({ id: "second", name: "Second", failBeforeFirstChunk: error });
    const third = copilot({ id: "third", name: "Third" });
    const { request, deps, output, model } = fixture({ failBeforeFirstChunk: error }, [
      second,
      third,
    ]);
    const result = await chatHandler(request, deps);
    expect(model.calls.sendRequest).toHaveLength(1);
    expect(second.calls.sendRequest).toHaveLength(1);
    expect(third.calls.sendRequest).toHaveLength(0);
    expect(output.text).toContain(NO_MODEL);
    expect(result.metadata).toMatchObject({ outcome: "noModel" });
  });

  it("maps another error from the fallback like any other error", async () => {
    const second = copilot({
      id: "second",
      name: "Second",
      failBeforeFirstChunk: new ModelError("blocked", "limit"),
    });
    const { request, deps, output } = fixture({ failBeforeFirstChunk: error }, [second]);
    await chatHandler(request, deps);
    expect(output.text).toContain(QUOTA);
  });

  it("shows the generic message when the fallback lookup itself fails", async () => {
    const { request, deps, output, selector } = fixture({ failBeforeFirstChunk: error });
    vi.spyOn(selector, "select").mockRejectedValue(new Error("lookup failed"));
    await chatHandler(request, deps);
    expect(output.text).toContain(GENERIC);
  });

  it("stays silent when the request is cancelled while looking for a fallback", async () => {
    const fallback = copilot({ id: "second", name: "Second" });
    const { request, deps, output, selector } = fixture({ failBeforeFirstChunk: error }, [
      fallback,
    ]);
    const signal = deps.signal as FakeCancellation;
    vi.spyOn(selector, "select").mockImplementation(async () => {
      signal.cancel();
      return [fallback];
    });
    const result = await chatHandler(request, deps);
    expect(result.metadata.outcome).toBe("cancelled");
    expect(output.text).toBe("");
    expect(fallback.calls.sendRequest).toHaveLength(0);
  });

  it("works without a budget context", async () => {
    const fallback = copilot({ id: "second", name: "Second Model", chunks: ["ok"] });
    const { request, deps, output } = fixture({ failBeforeFirstChunk: error }, [fallback], false);
    const result = await chatHandler(request, deps);
    expect(output.text).toBe("ok");
    expect(result.metadata).toMatchObject({ outcome: "completed", model: "Second Model" });
  });
});

describe("Blocked", () => {
  const error = new ModelError("blocked", "rate limited");

  it("shows the quota message when the request is rejected, charging nothing", async () => {
    const { request, deps, output, sink } = fixture({ failBeforeFirstChunk: error });
    await chatHandler(request, deps);
    expect(output.text).toContain(QUOTA);
    expect(sink.entries).toEqual([]);
  });

  it("mid-stream records the input and the output so far", async () => {
    const { request, deps, output, sink } = fixture({
      chunks: ["abcdefgh", "never"],
      failAfterChunk: { after: 1, error },
    });
    const result = await chatHandler(request, deps);
    expect(output.text).toContain(`abcdefgh

${QUOTA}`);
    expect(sink.entries).toHaveLength(1);
    expect(sink.entries[0]).toMatchObject({ tokens: { input: 1, output: 2 } });
    expect(result.metadata).toMatchObject({ outcome: "error", inputTokens: 1, outputTokens: 2 });
  });
});

describe("unknown errors", () => {
  it("include the original message", async () => {
    const { request, deps, output } = fixture({
      failBeforeFirstChunk: new ModelError("unknown", "socket hang up"),
    });
    await chatHandler(request, deps);
    expect(output.text).toContain(`${GENERIC}\n\nDetails: socket hang up`);
  });

  it("include the original message when the stream fails", async () => {
    const { request, deps, output } = fixture({
      failAfterChunk: { after: 1, error: new ModelError("unknown", "stream broke") },
    });
    await chatHandler(request, deps);
    expect(output.text).toContain("Details: stream broke");
  });

  it("charge only what was streamed", async () => {
    const { request, deps, sink } = fixture({
      chunks: ["abcd", "never"],
      failAfterChunk: { after: 1, error: new ModelError("unknown", "stream broke") },
    });
    await chatHandler(request, deps);
    expect(sink.entries[0]).toMatchObject({ tokens: { input: 1, output: 1 } });
  });
});

describe("the footer after an error", () => {
  const kinds = ["noPermissions", "notFound", "blocked", "unknown"] as const;
  it.each(kinds)("is still written after %s", async (kind) => {
    const error = kind === "unknown" ? new Error("boom") : new ModelError(kind, "x");
    const { request, deps, output } = fixture({ failBeforeFirstChunk: error });
    await chatHandler(request, deps);
    expect(output.text).toContain("org/repo");
  });
});

describe("errors that arrive through the stream (as the VS Code API reports them)", () => {
  it("NoPermissions before any output shows the consent message and records nothing", async () => {
    const { request, deps, output, sink } = fixture({
      failAfterChunk: { after: 0, error: new ModelError("noPermissions", "denied") },
    });
    const result = await chatHandler(request, deps);
    expect(output.text).toContain(CONSENT);
    expect(sink.entries).toEqual([]);
    expect(result.metadata).toMatchObject({ inputTokens: 0, outputTokens: 0 });
  });

  it("NotFound before any output retries once with the fallback", async () => {
    const fallback = copilot({ id: "second", name: "Second Model", chunks: ["ok"] });
    const { request, deps, output, sink } = fixture(
      { failAfterChunk: { after: 0, error: new ModelError("notFound", "gone") } },
      [fallback],
    );
    const result = await chatHandler(request, deps);
    expect(output.text).toContain("ok");
    expect(output.text).not.toContain(GENERIC);
    expect(result.metadata).toMatchObject({ outcome: "completed", model: "Second Model" });
    expect(sink.entries).toHaveLength(1);
    expect(sink.entries[0]).toMatchObject({ model: { name: "Second Model" } });
  });

  it("NotFound before any output with no fallback shows the no-model message", async () => {
    const { request, deps, output, sink } = fixture({
      failAfterChunk: { after: 0, error: new ModelError("notFound", "gone") },
    });
    await chatHandler(request, deps);
    expect(output.text).toContain(NO_MODEL);
    expect(sink.entries).toEqual([]);
  });

  it("NotFound after output is not retried and charges what was streamed", async () => {
    const fallback = copilot({ id: "second", name: "Second Model" });
    const { request, deps, output, sink } = fixture(
      {
        chunks: ["abcd", "never"],
        failAfterChunk: { after: 1, error: new ModelError("notFound", "gone") },
      },
      [fallback],
    );
    await chatHandler(request, deps);
    expect(fallback.calls.sendRequest).toHaveLength(0);
    expect(output.text).toContain("abcd");
    expect(output.text).toContain(`${GENERIC}\n\nDetails: gone`);
    expect(sink.entries[0]).toMatchObject({ tokens: { input: 1, output: 1 } });
  });

  it("Blocked before any output still charges the input, like any failed stream", async () => {
    const { request, deps, output, sink } = fixture({
      failAfterChunk: { after: 0, error: new ModelError("blocked", "limit") },
    });
    await chatHandler(request, deps);
    expect(output.text).toContain(QUOTA);
    expect(sink.entries[0]).toMatchObject({ tokens: { input: 1, output: 0 } });
  });
});

import { describe, expect, it } from "vitest";
import { chatHandler } from "../../../src/core/chatHandler";
import type { BudgetContext, ChatHandlerRequest, Deps } from "../../../src/core/chatHandler";
import { TokenCostModel } from "../../../src/core/cost/tokenCostModel";
import type { HistoryTurn } from "../../../src/core/types";
import {
  FakeCancellation,
  FakeModel,
  FakeModelSelector,
  FakeReferenceReader,
  InMemoryUsageSink,
  FixedClock,
  RecordingOutput,
} from "../../fakes";

const TOO_BIG =
  "This request is too large for the model's context window, even without the earlier messages. Attach less or shorten the prompt.";

/** FakeModel counts one token per 4 characters; a 400-token window leaves 360 usable. */
function turns(pairs: number): HistoryTurn[] {
  const result: HistoryTurn[] = [];
  for (let i = 1; i <= pairs; i++) {
    result.push(
      { kind: "request", prompt: `q${i}`.padEnd(160, "x") },
      { kind: "response", text: `a${i}`.padEnd(160, "y") },
    );
  }
  return result;
}

function fixture(options: { pairs: number; prompt?: string; window?: number; budget?: number }) {
  const model = new FakeModel({ maxInputTokens: options.window ?? 400, chunks: ["ok"] });
  const output = new RecordingOutput();
  const sink = new InMemoryUsageSink();
  const budget: BudgetContext | undefined =
    options.budget === undefined
      ? undefined
      : {
          subject: "org/repo",
          used: { tokens: 0 },
          budget: { tokens: options.budget },
          resetLabel: "Mon",
          costModel: new TokenCostModel(),
        };
  const request: ChatHandlerRequest = {
    prompt: options.prompt ?? "question",
    history: turns(options.pairs),
    model,
  };
  const deps: Deps = {
    selector: new FakeModelSelector([]),
    referenceReader: new FakeReferenceReader(),
    output,
    signal: new FakeCancellation(),
    ...(budget === undefined
      ? {}
      : {
          budget,
          recording: {
            sink,
            clock: new FixedClock("2026-10-14T09:12:03.120Z"),
            newId: () => "entry-1",
          },
        }),
  };
  return { model, output, sink, request, deps };
}

describe("context-window trimming in chatHandler", () => {
  it("sends the history unchanged when it fits, with no progress note", async () => {
    const { request, deps, model, output } = fixture({ pairs: 2, budget: 100_000 });
    await chatHandler(request, deps);
    expect(model.calls.sendRequest[0]).toHaveLength(5);
    expect(output.calls.filter((call) => call.kind === "progress")).toEqual([]);
  });

  it("drops the oldest pairs that do not fit and says how many messages were left out", async () => {
    // 4 pairs = 8 messages of 40 tokens + the prompt; 360 usable leaves room for 4 pairs - 1
    const { request, deps, model, output } = fixture({
      pairs: 5,
      budget: 100_000,
    });
    await chatHandler(request, deps);
    const sent = model.calls.sendRequest[0] ?? [];
    expect(sent.at(-1)).toEqual({ role: "user", text: "question" });
    expect(sent[0]?.text.startsWith("q1")).toBe(false);
    expect(sent.some((message) => message.text.startsWith("q5"))).toBe(true);
    expect((sent.length - 1) % 2).toBe(0);
    const dropped = 11 - sent.length;
    expect(dropped).toBeGreaterThan(0);
    expect(output.calls).toContainEqual({
      kind: "progress",
      text: `${dropped} earlier messages were left out to fit the model's context window.`,
    });
  });

  it("refuses when the prompt alone exceeds the window, sending and charging nothing", async () => {
    const { request, deps, model, output, sink } = fixture({
      pairs: 2,
      prompt: "z".repeat(2000),
      budget: 100_000,
    });
    const result = await chatHandler(request, deps);
    expect(output.text).toContain(TOO_BIG);
    expect(result.metadata).toMatchObject({ outcome: "refused", stopped: "precheck" });
    expect(model.calls.sendRequest).toEqual([]);
    expect(sink.entries).toEqual([]);
  });

  it("neither counts nor trims without a budget context", async () => {
    const { request, deps, model } = fixture({ pairs: 5, prompt: "z".repeat(2000) });
    await chatHandler(request, deps);
    expect(model.calls.countTokens).toEqual([]);
    expect(model.calls.sendRequest[0]).toHaveLength(11);
  });

  it("runs the pre-check on the count after trimming", async () => {
    // Untrimmed the input is about 8 * 40 + few tokens; the budget only fits the trimmed one.
    const { request, deps, model, output } = fixture({ pairs: 5, budget: 400 });
    const result = await chatHandler(request, deps);
    expect(result.metadata.outcome).toBe("completed");
    expect(model.calls.sendRequest).toHaveLength(1);
    expect(output.text).toContain("ok");
  });

  it("shows the generic message when counting for the trim fails", async () => {
    const { request, deps, model, output } = fixture({ pairs: 2, budget: 100_000 });
    const failing = new FakeModel({
      maxInputTokens: 400,
      countTokens: () => {
        throw new Error("tokenizer down");
      },
    });
    const result = await chatHandler({ ...request, model: failing }, deps);
    expect(result.metadata.outcome).toBe("error");
    expect(output.text).toContain("couldn't complete this request");
    expect(model.calls.sendRequest).toEqual([]);
    expect(failing.calls.sendRequest).toEqual([]);
  });

  it("stays silent when the request is cancelled while counting for the trim", async () => {
    const { request, deps, output } = fixture({ pairs: 2, budget: 100_000 });
    const signal = deps.signal as FakeCancellation;
    const slow = new FakeModel({
      maxInputTokens: 400,
      countTokens: (text) => {
        signal.cancel();
        return text.length;
      },
    });
    const result = await chatHandler({ ...request, model: slow }, deps);
    expect(result.metadata.outcome).toBe("cancelled");
    expect(output.text).toBe("");
    expect(slow.calls.sendRequest).toEqual([]);
  });
});

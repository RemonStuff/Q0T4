import { describe, expect, it, vi } from "vitest";
import { chatHandler } from "../../../../src/core/chatHandler";
import type { BudgetContext, ChatHandlerRequest, Deps } from "../../../../src/core/chatHandler";
import { TokenCostModel } from "../../../../src/core/cost/tokenCostModel";
import type { BudgetUnit, Cost } from "../../../../src/core/types";
import type { CancellationSignal } from "../../../../src/ports/CancellationSignal";
import {
  FakeCancellation,
  FakeModel,
  FakeModelSelector,
  FakeReferenceReader,
  FixedRateCostModel,
  RecordingOutput,
} from "../../../fakes";

const ERROR = "Q0T4 couldn't complete this request. Please try again.";
const STOP = "⛔ Stopped: org/repo weekly budget reached.";

function fixture(
  unit: BudgetUnit = "tokens",
  chunks: readonly string[] = ["abcd", "efgh", "ijkl"],
) {
  const amount = (value: number): Cost =>
    unit === "tokens" ? { tokens: value } : { tokens: 0, credits: value };
  const model = new FakeModel({ chunks, countTokens: (text) => text.length / 4 });
  const signal = new FakeCancellation();
  const output = new RecordingOutput();
  const budget: BudgetContext = {
    subject: "org/repo",
    used: amount(0),
    budget: amount(3),
    resetLabel: "Mon",
    costModel:
      unit === "tokens"
        ? new TokenCostModel()
        : new FixedRateCostModel({ input: 10_000, output: 10_000 }),
  };
  const request: ChatHandlerRequest = { prompt: "1234", history: [], model };
  const deps: Deps & { readonly budget: BudgetContext } = {
    selector: new FakeModelSelector([]),
    referenceReader: new FakeReferenceReader(),
    output,
    signal,
    budget,
  };
  return { model, signal, output, deps, request, amount };
}

describe.each(["tokens", "credits"] as const)("stream guard handler (%s)", (unit) => {
  it("shows the limit-reaching chunk then cancels without forwarding later chunks", async () => {
    const { request, deps, model, signal, output } = fixture(unit);
    const send = vi.spyOn(model, "sendRequest");
    const result = await chatHandler(request, deps);
    expect(output.text).toBe(`abcdefgh\n\n${STOP}`);
    expect(result).toEqual({
      metadata: { outcome: "stopped", stopped: "budget", model: model.name },
    });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    const modelSignal = send.mock.calls[0]?.[1];
    expect(modelSignal).not.toBe(signal);
    expect(modelSignal?.isCancellationRequested).toBe(true);
    expect(signal.isCancellationRequested).toBe(false);
    expect(output.calls.filter((call) => call.text.includes("⛔"))).toHaveLength(1);
  });

  it("cancels before requesting a later chunk even if the producer ignores cancellation", async () => {
    const { request, deps, model, output } = fixture(unit);
    const produced: string[] = [];
    const closed = vi.fn();
    async function* stream() {
      try {
        for (const chunk of ["abcd", "efgh", "ijkl"]) {
          produced.push(chunk);
          yield chunk;
        }
      } finally {
        closed();
      }
    }
    vi.spyOn(model, "sendRequest").mockResolvedValue(stream());
    await chatHandler(request, deps);
    expect(produced).toEqual(["abcd", "efgh"]);
    expect(closed).toHaveBeenCalledOnce();
    expect(output.text).toBe(`abcdefgh\n\n${STOP}`);
  });

  it("uses allowance for streaming as well as the input pre-check", async () => {
    const { request, deps, model, output, amount } = fixture(unit, [
      "abcd",
      "efgh",
      "ijkl",
      "mnop",
    ]);
    const budget = { ...deps.budget, extraAllowance: amount(1) };
    expect(await chatHandler(request, { ...deps, budget })).toEqual({
      metadata: { outcome: "stopped", stopped: "budget", model: model.name },
    });
    expect(output.text).toBe(`abcdefghijkl\n\n${STOP}`);
  });

  it("performs a real final count for a short affordable stream", async () => {
    const { request, deps, model, output, amount } = fixture(unit, ["short"]);
    const budget = { ...deps.budget, budget: amount(10_000) };
    expect(await chatHandler(request, { ...deps, budget })).toEqual({
      metadata: { outcome: "completed", model: model.name },
    });
    expect(model.calls.countTokens).toEqual([{ role: "user", text: "1234" }, "short"]);
    expect(output.text).toBe("short");
  });

  it("keeps a zero-output-headroom exact input fit eligible but stops on the first chunk", async () => {
    const { request, deps, output, amount } = fixture(unit);
    const budget = { ...deps.budget, budget: amount(1) };
    expect(await chatHandler(request, { ...deps, budget })).toMatchObject({
      metadata: { outcome: "stopped", stopped: "budget" },
    });
    expect(output.text).toBe(`abcd\n\n${STOP}`);
  });

  it("reports a stop found only by the final real recount instead of completion", async () => {
    const { request, deps, model, output, amount } = fixture(unit, ["abcd"]);
    const original = model.countTokens.bind(model);
    vi.spyOn(model, "countTokens").mockImplementation((input) =>
      typeof input === "string" ? Promise.resolve(20) : original(input),
    );
    expect(
      await chatHandler(request, { ...deps, budget: { ...deps.budget, budget: amount(10) } }),
    ).toEqual({ metadata: { outcome: "stopped", stopped: "budget", model: model.name } });
    expect(output.text).toBe(`abcd\n\n${STOP}`);
  });
});

describe("stream guard handler cleanup and failures", () => {
  it("separates an empty chunk budget stop without adding a leading blank paragraph", async () => {
    const { request, deps, output, amount } = fixture("tokens", ["", "must not arrive"]);
    expect(
      await chatHandler(request, { ...deps, budget: { ...deps.budget, budget: amount(1) } }),
    ).toMatchObject({ metadata: { outcome: "stopped", stopped: "budget" } });
    expect(output.text).toBe(STOP);
  });

  it("keeps user cancellation silent while cancelling only the linked model source", async () => {
    const { request, deps, model, output, signal } = fixture();
    const send = vi.spyOn(model, "sendRequest");
    const write = output.markdown.bind(output);
    vi.spyOn(output, "markdown").mockImplementation((text) => {
      write(text);
      signal.cancel();
    });
    expect(await chatHandler(request, deps)).toEqual({
      metadata: { outcome: "cancelled", model: model.name },
    });
    expect(send.mock.calls[0]?.[1].isCancellationRequested).toBe(true);
    expect(output.text).toBe("abcd");
  });

  it("reports a tokenizer failure safely, preserves the visible chunk and cancels the producer", async () => {
    const { request, deps, model, output } = fixture();
    const original = model.countTokens.bind(model);
    const send = vi.spyOn(model, "sendRequest");
    vi.spyOn(model, "countTokens").mockImplementation((input) =>
      typeof input === "string"
        ? Promise.reject(new Error("private output count failure"))
        : original(input),
    );
    expect(await chatHandler(request, deps)).toEqual({
      metadata: { outcome: "error", model: model.name },
    });
    expect(output.text).toBe(`abcd\n\n${ERROR}`);
    expect(send.mock.calls[0]?.[1].isCancellationRequested).toBe(true);
  });

  it("reports final recount failure instead of claiming completion", async () => {
    const { request, deps, model, output, amount } = fixture("tokens", ["short"]);
    const send = vi.spyOn(model, "sendRequest");
    const original = model.countTokens.bind(model);
    vi.spyOn(model, "countTokens").mockImplementation((input) =>
      typeof input === "string"
        ? Promise.reject(new Error("private final count failure"))
        : original(input),
    );
    expect(
      await chatHandler(request, { ...deps, budget: { ...deps.budget, budget: amount(10_000) } }),
    ).toMatchObject({ metadata: { outcome: "error" } });
    expect(output.text).toBe(`short\n\n${ERROR}`);
    expect(send.mock.calls[0]?.[1].isCancellationRequested).toBe(true);
  });

  it("keeps cancellation during a pending output count silent and closes the producer", async () => {
    const { request, deps, model, signal, output } = fixture();
    let began!: () => void;
    let resolve!: (value: number) => void;
    const started = new Promise<void>((ready) => {
      began = ready;
    });
    const pending = new Promise<number>((finish) => {
      resolve = finish;
    });
    const original = model.countTokens.bind(model);
    vi.spyOn(model, "countTokens").mockImplementation((input) => {
      if (typeof input !== "string") return original(input);
      began();
      return pending;
    });
    const send = vi.spyOn(model, "sendRequest");
    const handling = chatHandler(request, deps);
    expect(await Promise.race([started.then(() => true), handling.then(() => false)])).toBe(true);
    signal.cancel();
    expect(await handling).toEqual({ metadata: { outcome: "cancelled", model: model.name } });
    expect(output.text).toBe("abcd");
    expect(send.mock.calls[0]?.[1].isCancellationRequested).toBe(true);
    resolve(1);
  });

  it("stops safely if output cost conversion throws after input was accepted", async () => {
    const { request, deps, model, output } = fixture();
    const original = deps.budget.costModel.cost.bind(deps.budget.costModel);
    vi.spyOn(deps.budget.costModel, "cost").mockImplementation((selected, tokens) => {
      if (tokens.output > 0) throw new Error("private rate failure");
      return original(selected, tokens);
    });
    const send = vi.spyOn(model, "sendRequest");
    expect(await chatHandler(request, deps)).toEqual({
      metadata: { outcome: "error", model: model.name },
    });
    expect(output.text).toBe(`abcd\n\n${ERROR}`);
    expect(send.mock.calls[0]?.[1].isCancellationRequested).toBe(true);
  });

  it("disposes its model link when sendRequest rejects before streaming", async () => {
    const { request, deps, model, output, signal } = fixture();
    const subscribe = signal.onCancellationRequested.bind(signal);
    const live = new Set<symbol>();
    vi.spyOn(signal, "onCancellationRequested").mockImplementation((listener) => {
      const key = Symbol();
      live.add(key);
      const registration = subscribe(listener);
      return {
        dispose() {
          live.delete(key);
          registration.dispose();
        },
      };
    });
    const send = vi
      .spyOn(model, "sendRequest")
      .mockRejectedValue(new Error("private send failure"));
    expect(await chatHandler(request, deps)).toEqual({
      metadata: { outcome: "error", model: model.name },
    });
    expect(output.text).toBe(ERROR);
    expect(send.mock.calls[0]?.[1].isCancellationRequested).toBe(true);
    expect(live.size).toBe(0);
  });

  it("cancels a model whose returned stream cannot provide an iterator", async () => {
    const { request, deps, model, output } = fixture();
    const stream: AsyncIterable<string> = {
      [Symbol.asyncIterator]() {
        throw new Error("private iterator failure");
      },
    };
    const send = vi.spyOn(model, "sendRequest").mockResolvedValue(stream);
    expect(await chatHandler(request, deps)).toMatchObject({ metadata: { outcome: "error" } });
    expect(output.text).toBe(ERROR);
    expect(send.mock.calls[0]?.[1].isCancellationRequested).toBe(true);
  });

  it("surfaces iterator cleanup failure instead of a successful budget stop", async () => {
    const { request, deps, model, output } = fixture();
    const close = vi.fn().mockRejectedValue(new Error("private close failure"));
    const stream: AsyncIterable<string> = {
      [Symbol.asyncIterator]: () => ({
        next: vi.fn().mockResolvedValue({ done: false, value: "abcdabcd" }),
        return: close,
      }),
    };
    vi.spyOn(model, "sendRequest").mockResolvedValue(stream);
    expect(await chatHandler(request, deps)).toEqual({
      metadata: { outcome: "error", model: model.name },
    });
    expect(output.text).toBe(`abcdabcd\n\n${ERROR}`);
    expect(close).toHaveBeenCalledOnce();
  });

  it("preserves output failure and cancels the model before closing its iterator", async () => {
    const { request, deps, model, output } = fixture();
    const failure = new Error("output unavailable");
    let modelSignal: CancellationSignal | undefined;
    const observed: boolean[] = [];
    async function* stream() {
      try {
        yield "abcd";
      } finally {
        observed.push(modelSignal?.isCancellationRequested ?? false);
      }
    }
    vi.spyOn(model, "sendRequest").mockImplementation(async (_messages, signal) => {
      modelSignal = signal;
      return stream();
    });
    vi.spyOn(output, "markdown").mockImplementation(() => {
      throw failure;
    });
    await expect(chatHandler(request, deps)).rejects.toBe(failure);
    expect(observed).toEqual([true]);
  });

  it("propagates a stop-note output failure instead of rewriting it as a model error", async () => {
    const { request, deps, output, model } = fixture();
    const failure = new Error("stop note unavailable");
    const write = output.markdown.bind(output);
    vi.spyOn(output, "markdown").mockImplementation((text) => {
      if (text.includes("⛔")) throw failure;
      write(text);
    });
    const send = vi.spyOn(model, "sendRequest");
    await expect(chatHandler(request, deps)).rejects.toBe(failure);
    expect(output.text).toBe("abcdefgh");
    expect(send.mock.calls[0]?.[1].isCancellationRequested).toBe(true);
  });

  it("disposes its parent cancellation subscription on normal completion", async () => {
    const { request, deps, model, signal, amount } = fixture("tokens", []);
    const subscribe = signal.onCancellationRequested.bind(signal);
    const live = new Set<symbol>();
    vi.spyOn(signal, "onCancellationRequested").mockImplementation((listener) => {
      const key = Symbol();
      live.add(key);
      const subscription = subscribe(listener);
      return {
        dispose() {
          live.delete(key);
          subscription.dispose();
        },
      };
    });
    await chatHandler(request, { ...deps, budget: { ...deps.budget, budget: amount(10_000) } });
    expect(live.size).toBe(0);
    expect(model.calls.sendRequest).toHaveLength(1);
  });

  it("does not create a model cancellation link on a pre-check refusal", async () => {
    const { request, deps, model, amount } = fixture();
    const send = vi.spyOn(model, "sendRequest");
    expect(
      await chatHandler(request, { ...deps, budget: { ...deps.budget, budget: amount(0) } }),
    ).toMatchObject({ metadata: { outcome: "refused", stopped: "precheck" } });
    expect(send).not.toHaveBeenCalled();
  });

  it("fails closed and releases the model link if injected policy changes during guard setup", async () => {
    const { request, deps, model, signal, output, amount } = fixture();
    let reads = 0;
    const budget: BudgetContext = {
      ...deps.budget,
      get used() {
        return amount(++reads === 1 ? 0 : NaN);
      },
    };
    const subscribe = signal.onCancellationRequested.bind(signal);
    const dispose = vi.fn();
    vi.spyOn(signal, "onCancellationRequested").mockImplementation((listener) => {
      const subscription = subscribe(listener);
      return {
        dispose() {
          dispose();
          subscription.dispose();
        },
      };
    });
    expect(await chatHandler(request, { ...deps, budget })).toEqual({
      metadata: { outcome: "error" },
    });
    expect(output.text).toBe(ERROR);
    expect(model.calls.sendRequest).toEqual([]);
    expect(dispose).toHaveBeenCalledTimes(2);
  });

  it("keeps the installed no-budget path uncounted and unchanged", async () => {
    const { request, deps, model, output } = fixture();
    const { budget, ...withoutBudget } = deps;
    const send = vi.spyOn(model, "sendRequest");
    expect(await chatHandler(request, withoutBudget)).toEqual({
      metadata: { outcome: "completed", model: model.name },
    });
    expect(output.text).toBe("abcdefghijkl");
    expect(model.calls.countTokens).toEqual([]);
    expect(send.mock.calls[0]?.[1]).toBe(deps.signal);
  });
});

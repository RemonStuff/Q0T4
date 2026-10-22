import { describe, expect, it, vi } from "vitest";
import { chatHandler } from "../../../../src/core/chatHandler";
import type { BudgetContext, ChatHandlerRequest, Deps } from "../../../../src/core/chatHandler";
import { TokenCostModel } from "../../../../src/core/cost/tokenCostModel";
import { buildMessages } from "../../../../src/core/messages/buildMessages";
import type { BudgetUnit, Cost } from "../../../../src/core/types";
import {
  FakeCancellation,
  FakeModel,
  FakeModelSelector,
  FakeReferenceReader,
  FixedRateCostModel,
  RecordingOutput,
} from "../../../fakes";

function fixture(unit: BudgetUnit = "tokens") {
  const cost = (value: number): Cost =>
    unit === "tokens" ? { tokens: value } : { tokens: 0, credits: value };
  const model = new FakeModel({ chunks: ["reply"], countTokens: (text) => text.length });
  const signal = new FakeCancellation();
  const output = new RecordingOutput();
  const costModel =
    unit === "tokens"
      ? new TokenCostModel()
      : new FixedRateCostModel({ input: 10_000, output: 20_000 });
  const budget: BudgetContext = {
    subject: "org/repo",
    costModel,
    used: cost(0),
    budget: cost(0),
    resetLabel: "reset date unavailable",
  };
  const request: ChatHandlerRequest = { model, prompt: "hello", history: [] };
  const deps: Deps & { readonly budget: BudgetContext } = {
    selector: new FakeModelSelector([]),
    referenceReader: new FakeReferenceReader(),
    output,
    signal,
    budget,
  };
  return { model, signal, output, costModel, request, deps, cost };
}

describe.each(["tokens", "credits"] as const)("handler budget gate (%s)", (unit) => {
  it("refuses without sending and returns only truthful pre-check metadata", async () => {
    const { request, deps, model, output } = fixture(unit);

    const result = await chatHandler(request, deps);
    expect(result).toMatchObject({ metadata: { outcome: "refused", stopped: "precheck" } });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(model.calls.sendRequest).toEqual([]);
    expect(output.text).toContain("org/repo");
    expect(output.text).toContain(`Budget: 0 ${unit}`);
    expect(output.text).toContain("reset date unavailable");
    expect(output.text).toContain("`/status`");
    expect(output.text).toContain("`/use <subject>`");
  });

  it("uses the long reset label in the refusal when one is given, and the short one in the footer", async () => {
    const { request, deps, output } = fixture(unit);
    const budget = { ...deps.budget, resetLabel: "Mon", resetLabelLong: "Mon 19 Oct" };
    await chatHandler(request, { ...deps, budget, footer: { warnAtPercent: 80 } });
    expect(output.text).toContain("Resets: Mon 19 Oct.");
    expect(output.text).toContain("this week · resets Mon*");
  });

  it("admits an exact input fit before the stream guard stops its output", async () => {
    const { request, deps, model, output, costModel, cost } = fixture(unit);
    const price = vi.spyOn(costModel, "cost");
    const budget = { ...deps.budget, used: cost(2), budget: cost(7) };

    expect(await chatHandler(request, { ...deps, budget })).toMatchObject({
      metadata: { outcome: "stopped", stopped: "budget", model: model.name },
    });
    expect(price).toHaveBeenNthCalledWith(1, model, { input: 5, output: 0 });
    expect(model.calls.countTokens).toEqual([{ role: "user", text: "hello" }, "reply"]);
    expect(model.calls.sendRequest).toEqual([[{ role: "user", text: "hello" }]]);
    expect(output.text).toBe("reply\n\n⛔ Stopped: org/repo weekly budget reached.");
  });

  it("passes extra allowance to the decision", async () => {
    const { request, deps, model, cost } = fixture(unit);
    const budget = {
      ...deps.budget,
      used: cost(2),
      budget: cost(4),
      extraAllowance: cost(3),
    };

    expect(await chatHandler(request, { ...deps, budget })).toMatchObject({
      metadata: { outcome: "stopped", stopped: "budget" },
    });
    expect(model.calls.sendRequest).toHaveLength(1);
  });

  it("counts completed history and exact formatted references before the pre-check", async () => {
    const { request, deps, model, costModel } = fixture(unit);
    const price = vi.spyOn(costModel, "cost");
    const history = [
      { kind: "request", prompt: "previous question" },
      { kind: "response", text: "previous answer" },
    ] as const;
    const reader = new FakeReferenceReader({ file: { label: "file.ts", text: "content" } });
    const messages = buildMessages(request.prompt, history, [
      { label: "file.ts", text: "content" },
    ]);

    await chatHandler(
      { ...request, history, references: [{ id: "file", value: "file" }] },
      { ...deps, referenceReader: reader },
    );

    expect(model.calls.countTokens).toEqual(messages);
    expect(price).toHaveBeenCalledExactlyOnceWith(model, {
      input: messages.reduce((total, message) => total + message.text.length, 0),
      output: 0,
    });
    expect(model.calls.sendRequest).toEqual([]);
  });

  it("rejects invalid budget state without sending or exposing errors", async () => {
    const { request, deps, model, output, cost } = fixture(unit);
    const budget = { ...deps.budget, budget: cost(NaN) };

    expect(await chatHandler(request, { ...deps, budget })).toMatchObject({
      metadata: { outcome: "error" },
    });
    expect(output.text).toBe("Q0T4 couldn't complete this request. Please try again.");
    expect(model.calls.sendRequest).toEqual([]);
  });
});

describe("handler budget orchestration", () => {
  it("preserves the unmetered path when budget context is absent", async () => {
    const { request, deps, model, output } = fixture();
    const { budget, ...withoutBudget } = deps;
    vi.spyOn(model, "countTokens").mockRejectedValue(new Error("must not count"));

    expect(await chatHandler(request, withoutBudget)).toMatchObject({
      metadata: { outcome: "completed", model: model.name },
    });
    expect(model.calls.countTokens).toEqual([]);
    expect(output.text).toBe("reply");
  });

  it("counts and costs the resolved model rather than the unavailable selection", async () => {
    const { request, deps, model, costModel } = fixture();
    const fallback = new FakeModel({ id: "fallback", vendor: "copilot", countTokens: () => 7 });
    const price = vi.spyOn(costModel, "cost");

    expect(
      await chatHandler(
        { ...request, availability: "unavailable" },
        { ...deps, selector: new FakeModelSelector([fallback]) },
      ),
    ).toMatchObject({ metadata: { outcome: "refused", stopped: "precheck" } });
    expect(price).toHaveBeenCalledExactlyOnceWith(fallback, { input: 7, output: 0 });
    expect(model.calls.countTokens).toEqual([]);
    expect(fallback.calls.sendRequest).toEqual([]);
  });

  it("stops before sending when token counting fails", async () => {
    const { request, deps, model, output, costModel } = fixture();
    vi.spyOn(model, "countTokens").mockRejectedValue(new Error("private tokenizer detail"));
    const price = vi.spyOn(costModel, "cost");

    expect(await chatHandler(request, deps)).toMatchObject({ metadata: { outcome: "error" } });
    expect(output.text).toBe("Q0T4 couldn't complete this request. Please try again.");
    expect(price).not.toHaveBeenCalled();
    expect(model.calls.sendRequest).toEqual([]);
  });

  it("keeps cancellation during pending token counting silent and prevents sending", async () => {
    const { request, deps, model, output, signal } = fixture();
    let started!: () => void;
    let finish!: (value: number) => void;
    const began = new Promise<void>((resolve) => {
      started = resolve;
    });
    const pending = new Promise<number>((resolve) => {
      finish = resolve;
    });
    vi.spyOn(model, "countTokens").mockImplementation(() => {
      started();
      return pending;
    });
    const handling = chatHandler(request, deps);

    expect(await Promise.race([began.then(() => true), handling.then(() => false)])).toBe(true);
    signal.cancel();
    expect(await handling).toMatchObject({ metadata: { outcome: "cancelled" } });
    expect(output.calls).toEqual([]);
    expect(model.calls.sendRequest).toEqual([]);
    finish(5);
  });

  it("observes cancellation during cost conversion before any output or send", async () => {
    const { request, deps, model, output, signal, costModel } = fixture();
    vi.spyOn(costModel, "cost").mockImplementation(() => {
      signal.cancel();
      return { cost: { tokens: 5 } };
    });

    expect(await chatHandler(request, deps)).toMatchObject({ metadata: { outcome: "cancelled" } });
    expect(output.calls).toEqual([]);
    expect(model.calls.sendRequest).toEqual([]);
  });

  it("reports cost-model failures without leaking details or sending", async () => {
    const { request, deps, model, output, costModel } = fixture();
    vi.spyOn(costModel, "cost").mockImplementation(() => {
      throw new Error("private pricing detail");
    });

    expect(await chatHandler(request, deps)).toMatchObject({ metadata: { outcome: "error" } });
    expect(output.text).toBe("Q0T4 couldn't complete this request. Please try again.");
    expect(model.calls.sendRequest).toEqual([]);
  });

  it("propagates refusal-output failures unchanged rather than reporting model failure", async () => {
    const { request, deps, model, output } = fixture();
    const failure = new Error("output unavailable");
    vi.spyOn(output, "markdown").mockImplementation(() => {
      throw failure;
    });

    await expect(chatHandler(request, deps)).rejects.toBe(failure);
    expect(model.calls.sendRequest).toEqual([]);
  });

  it("rejects missing active credits in handler budget context", async () => {
    const { request, deps, model, output } = fixture("credits");
    const budget = { ...deps.budget, used: { tokens: 0 } };

    expect(await chatHandler(request, { ...deps, budget })).toMatchObject({
      metadata: { outcome: "error" },
    });
    expect(output.text).toBe("Q0T4 couldn't complete this request. Please try again.");
    expect(model.calls.sendRequest).toEqual([]);
  });
});

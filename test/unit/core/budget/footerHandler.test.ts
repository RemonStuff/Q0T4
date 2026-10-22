import { describe, expect, it, vi } from "vitest";
import { chatHandler } from "../../../../src/core/chatHandler";
import type { BudgetContext, ChatHandlerRequest, Deps } from "../../../../src/core/chatHandler";
import { TokenCostModel } from "../../../../src/core/cost/tokenCostModel";
import { FOOTER_SENTINEL } from "../../../../src/core/format/footer";
import { stripFooter } from "../../../../src/core/messages/stripFooter";
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

// FakeModel: one token per 4 characters. The credit model prices one token at 1 credit.
function fixture(unit: BudgetUnit, options: FakeModelOptions = {}, limit = 100, used = 0) {
  const amount = (value: number): Cost =>
    unit === "tokens" ? { tokens: value } : { tokens: 0, credits: value };
  const model = new FakeModel({
    name: "GPT-5",
    chunks: ["abcd", "efgh", "ijkl"],
    countTokens: (text) => text.length / 4,
    ...options,
  });
  const signal = new FakeCancellation();
  const output = new RecordingOutput();
  const sink = new InMemoryUsageSink();
  const budget: BudgetContext = {
    subject: "org/repo",
    used: amount(used),
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
    output,
    signal,
    budget,
    recording: { sink, clock: new FixedClock("2026-10-14T09:12:03.120Z"), newId: () => "id" },
    footer: { warnAtPercent: 80 },
  };
  return { model, signal, output, sink, request, deps };
}

const unitLabel = (unit: BudgetUnit) => (unit === "credits" ? " credits" : "");

describe.each(["tokens", "credits"] as const)("footer in chatHandler (%s)", (unit) => {
  it("appends the footer with this request's usage after the reply", async () => {
    const { request, deps, output } = fixture(unit, {}, 100, 10);
    await chatHandler(request, deps);
    expect(output.text).toBe(
      `abcdefghijkl\n\n${FOOTER_SENTINEL}\n\n` +
        `*org/repo: 14 / 100${unitLabel(unit)} this week · resets Mon · GPT\\-5*`,
    );
    expect(stripFooter(output.text)).toBe("abcdefghijkl");
  });

  it("adds a warning after the footer once usage passes warnAtPercent", async () => {
    const { request, deps, output } = fixture(unit, {}, 100, 80);
    await chatHandler(request, deps);
    expect(output.text).toMatch(/GPT\\-5\*\n\n⚠️ 84% of the weekly budget used\.$/);
    expect(stripFooter(output.text)).toBe("abcdefghijkl");
  });

  it("shows ⛔ after a budget cut-off, after the stop note", async () => {
    const { request, deps, output } = fixture(unit, {}, 3);
    await chatHandler(request, deps);
    expect(output.text).toContain("⛔ Stopped: org/repo weekly budget reached.");
    expect(output.text).toMatch(
      /\* \n\n⛔ Weekly budget reached\.$|\*\n\n⛔ Weekly budget reached\.$/,
    );
    expect(output.text.indexOf("Stopped")).toBeLessThan(output.text.indexOf(FOOTER_SENTINEL));
  });

  it("adds a footer without a model name to a refusal, charging nothing", async () => {
    const { request, deps, output, model } = fixture(unit, {}, 0);
    await chatHandler(request, deps);
    expect(model.calls.sendRequest).toEqual([]);
    expect(output.text).toContain(
      `${FOOTER_SENTINEL}\n\n*org/repo: 0 / 0${unitLabel(unit)} this week · resets Mon*`,
    );
    expect(output.text).not.toContain("GPT");
  });

  it("adds a footer after a model error, with what was charged", async () => {
    const { request, deps, output } = fixture(unit, {
      failAfterChunk: { after: 2, error: new Error("boom") },
    });
    await chatHandler(request, deps);
    expect(output.text).toContain(
      `*org/repo: 3 / 100${unitLabel(unit)} this week · resets Mon · GPT\\-5*`,
    );
  });

  it("stays silent after a user cancellation", async () => {
    const { request, deps, output, model, signal } = fixture(unit);
    async function* stream() {
      yield "abcd";
      signal.cancel();
      yield "efgh";
    }
    vi.spyOn(model, "sendRequest").mockResolvedValue(stream());
    await chatHandler(request, deps);
    expect(output.text).toBe("abcd");
  });

  it("still writes the footer when recording fails", async () => {
    const { request, deps, output, sink } = fixture(unit);
    sink.fail = "reject";
    await chatHandler(request, deps);
    expect(output.text).toContain(FOOTER_SENTINEL);
    expect(output.text).toContain("abcdefghijkl");
  });
});

describe("footer in chatHandler (when it is not written)", () => {
  it("writes nothing extra without the footer setting", async () => {
    const { request, deps, output } = fixture("tokens");
    const { footer: _footer, ...withoutFooter } = deps;
    await chatHandler(request, withoutFooter);
    expect(output.text).toBe("abcdefghijkl");
  });

  it("writes nothing extra without a budget context", async () => {
    const { request, deps, output } = fixture("tokens");
    const { budget: _budget, ...withoutBudget } = deps;
    await chatHandler(request, withoutBudget);
    expect(output.text).toBe("abcdefghijkl");
  });

  it("writes no footer for a slash command or when no model can be resolved", async () => {
    const command = fixture("tokens");
    await chatHandler({ ...command.request, command: "status" }, command.deps);
    expect(command.output.text).not.toContain(FOOTER_SENTINEL);

    const unavailable = fixture("tokens");
    await chatHandler({ ...unavailable.request, availability: "unavailable" }, unavailable.deps);
    expect(unavailable.output.text).not.toContain(FOOTER_SENTINEL);
  });
});

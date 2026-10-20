import { describe, expect, it, vi } from "vitest";
import {
  NEAR_LIMIT_RATIO,
  RECOUNT_CHARS,
  StreamGuard,
} from "../../../../src/core/budget/streamGuard";
import type { StreamGuardOptions } from "../../../../src/core/budget/streamGuard";
import { TokenCostModel } from "../../../../src/core/cost/tokenCostModel";
import { Cancelled } from "../../../../src/core/errors/cancelled";
import { CountError } from "../../../../src/core/errors/countError";
import type { BudgetUnit, Cost } from "../../../../src/core/types";
import { FakeCancellation, FakeModel, FixedRateCostModel } from "../../../fakes";

function fixture(unit: BudgetUnit = "tokens", overrides: Partial<StreamGuardOptions> = {}) {
  const amount = (value: number): Cost =>
    unit === "tokens" ? { tokens: value } : { tokens: 0, credits: value };
  const model = new FakeModel({ countTokens: (text) => text.length / 4 });
  const signal = new FakeCancellation();
  const cancel = vi.fn();
  const costModel =
    unit === "tokens"
      ? new TokenCostModel()
      : new FixedRateCostModel({ input: 10_000, output: 10_000 });
  const options: StreamGuardOptions = {
    model,
    costModel,
    signal,
    cancel,
    used: amount(0),
    input: amount(0),
    budget: amount(10_000),
    ...overrides,
  };
  return { guard: new StreamGuard(options), model, signal, cancel, costModel, amount, options };
}

describe("stream guard constants", () => {
  it("documents the fixed recount interval and near-limit ratio", () => {
    expect(RECOUNT_CHARS).toBe(400);
    expect(NEAR_LIMIT_RATIO).toBe(0.1);
  });
});

describe.each(["tokens", "credits"] as const)("StreamGuard (%s)", (unit) => {
  it("does not recount before 400 accumulated characters far from the limit", async () => {
    const { guard, model, cancel } = fixture(unit);
    for (let index = 0; index < 99; index++) {
      expect(await guard.onChunk("abcd")).toBe("continue");
    }
    expect(model.calls.countTokens).toEqual([]);
    expect(await guard.onChunk("efgh")).toBe("continue");
    expect(model.calls.countTokens).toEqual(["abcd".repeat(99) + "efgh"]);
    expect(cancel).not.toHaveBeenCalled();
  });

  it("recounts the entire accumulated text, not each chunk or only the delta", async () => {
    const { guard, model } = fixture(unit);
    for (let index = 0; index < 200; index++) await guard.onChunk("abcd");
    expect(model.calls.countTokens).toEqual(["abcd".repeat(100), "abcd".repeat(200)]);
  });

  it("recounts every chunk when estimated remaining is under ten percent", async () => {
    const setup = fixture(unit);
    const { guard, model } = fixture(unit, {
      used: setup.amount(905),
      budget: setup.amount(1000),
    });
    for (let index = 0; index < 3; index++) await guard.onChunk("abcd");
    expect(model.calls.countTokens).toEqual(["abcd", "abcdabcd", "abcdabcdabcd"]);
  });

  it("recounts below twice the last chunk cost even outside the ten-percent zone", async () => {
    const setup = fixture(unit);
    const { guard, model } = fixture(unit, {
      used: setup.amount(300),
      budget: setup.amount(500),
    });
    await guard.onChunk("x".repeat(280));
    expect(model.calls.countTokens).toEqual(["x".repeat(280)]);
    await guard.onChunk("abcd");
    expect(model.calls.countTokens).toEqual(["x".repeat(280), "x".repeat(280) + "abcd"]);
  });

  it("anchors estimates to the last exact count instead of estimating all text again", async () => {
    const setup = fixture(unit);
    const model = new FakeModel({ countTokens: (text) => 1700 + text.length / 4 });
    const { guard } = fixture(unit, { model, budget: setup.amount(2000) });
    await guard.onChunk("x".repeat(400));
    await guard.onChunk("abcd");
    expect(model.calls.countTokens).toEqual(["x".repeat(400), "x".repeat(400) + "abcd"]);
  });

  it("stops at equality after counting input, used cost and output in the active unit", async () => {
    const setup = fixture(unit);
    const { guard, cancel } = fixture(unit, {
      used: setup.amount(2),
      input: setup.amount(3),
      budget: setup.amount(6),
    });
    expect(await guard.onChunk("abcd")).toBe("stop");
    expect(cancel).toHaveBeenCalledOnce();
    expect(await guard.onChunk("must not be counted")).toBe("stop");
    expect(cancel).toHaveBeenCalledOnce();
    expect(await guard.finalCount()).toBe(1);
  });

  it("does not stop based on an estimate when the real recount is still below budget", async () => {
    const setup = fixture(unit);
    const model = new FakeModel({ countTokens: () => 1 });
    const { guard, cancel } = fixture(unit, { model, budget: setup.amount(10) });
    expect(await guard.onChunk("x".repeat(40))).toBe("continue");
    expect(model.calls.countTokens).toEqual(["x".repeat(40)]);
    expect(cancel).not.toHaveBeenCalled();
    expect(await guard.finalCount()).toBe(1);
  });

  it.each([0, 1])(
    "stops on the first chunk with no remaining budget (overshoot %s)",
    async (extra) => {
      const setup = fixture(unit);
      const { guard, cancel } = fixture(unit, {
        used: setup.amount(10 + extra),
        budget: setup.amount(10),
      });
      expect(await guard.onChunk("abcd")).toBe("stop");
      expect(cancel).toHaveBeenCalledOnce();
    },
  );

  it("moves the cut-off by exactly the extra allowance", async () => {
    const setup = fixture(unit);
    const { guard, cancel } = fixture(unit, {
      used: setup.amount(9),
      budget: setup.amount(10),
      extraAllowance: setup.amount(2),
    });
    expect(await guard.onChunk("abcd")).toBe("continue");
    expect(await guard.onChunk("abcd")).toBe("continue");
    expect(await guard.onChunk("abcd")).toBe("stop");
    expect(cancel).toHaveBeenCalledOnce();
    expect(await guard.finalCount()).toBe(3);
  });

  it("counts final output with the real tokenizer and reuses an unchanged exact count", async () => {
    const model = new FakeModel({ countTokens: () => 7 });
    const { guard } = fixture(unit, { model });
    await guard.onChunk("short reply");
    expect(model.calls.countTokens).toEqual([]);
    expect(await guard.finalCount()).toBe(7);
    expect(await guard.finalCount()).toBe(7);
    expect(model.calls.countTokens).toEqual(["short reply"]);
    await guard.onChunk(" more");
    expect(await guard.finalCount()).toBe(7);
    expect(model.calls.countTokens).toEqual(["short reply", "short reply more"]);
  });

  it("returns zero for an empty stream without a provider call", async () => {
    const { guard, model } = fixture(unit);
    expect(await guard.finalCount()).toBe(0);
    expect(model.calls.countTokens).toEqual([]);
  });

  it("detects a limit first revealed by the final real recount", async () => {
    const setup = fixture(unit);
    const model = new FakeModel({ countTokens: () => 20 });
    const { guard, cancel } = fixture(unit, { model, budget: setup.amount(10) });
    expect(await guard.onChunk("abcd")).toBe("continue");
    expect(cancel).not.toHaveBeenCalled();
    expect(await guard.finalCount()).toBe(20);
    expect(guard.stopped).toBe(true);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each([4, 16, 64, 399, 400, 401, 1600])(
    "bounds detection overshoot by one character interval plus the arriving chunk (%s chars)",
    async (size) => {
      const setup = fixture(unit);
      const model = new FakeModel({ countTokens: (text) => text.length });
      const { guard, cancel } = fixture(unit, { model, budget: setup.amount(2003) });
      let received = 0;
      let decision: "continue" | "stop" = "continue";
      while (decision === "continue" && received < 10_000) {
        received += size;
        decision = await guard.onChunk("x".repeat(size));
      }
      expect(decision).toBe("stop");
      expect(received).toBeGreaterThanOrEqual(2003);
      expect(received - 2003).toBeLessThan(RECOUNT_CHARS + size);
      expect(await guard.finalCount()).toBe(received);
      expect(cancel).toHaveBeenCalledOnce();
    },
  );

  it("uses far fewer tokenizer calls than chunks for a long affordable reply", async () => {
    const { guard, model, cancel } = fixture(unit);
    for (let index = 0; index < 1000; index++) await guard.onChunk("abcd");
    expect(await guard.finalCount()).toBe(1000);
    expect(model.calls.countTokens).toHaveLength(10);
    expect(cancel).not.toHaveBeenCalled();
  });

  it("costs output tokens at the output rate with zero input tokens", async () => {
    const { guard, costModel, model } = fixture(unit);
    const price = vi.spyOn(costModel, "cost");
    await guard.onChunk("x".repeat(400));
    expect(price).toHaveBeenCalledWith(model, { input: 0, output: 100 });
    expect(price.mock.calls.every(([, counts]) => counts.input === 0)).toBe(true);
  });
});

describe("StreamGuard failures and credits", () => {
  it("stops earlier for a higher output rate in credits mode", async () => {
    async function receivedAtStop(rate: number) {
      const { guard } = fixture("credits", {
        budget: { tokens: 0, credits: 10 },
        costModel: new FixedRateCostModel({ input: 10_000, output: rate }),
      });
      let chunks = 0;
      while (chunks < 20) {
        chunks++;
        if ((await guard.onChunk("abcd")) === "stop") return chunks;
      }
      throw new Error("Guard failed to stop");
    }
    expect(await receivedAtStop(10_000)).toBe(10);
    expect(await receivedAtStop(20_000)).toBe(5);
  });

  it.each([NaN, Infinity, -1])("rejects invalid real output counts (%s)", async (count) => {
    const model = new FakeModel({ countTokens: () => count });
    const { guard } = fixture("tokens", { model });
    await expect(guard.onChunk("x".repeat(400))).rejects.toBeInstanceOf(RangeError);
  });

  it("rejects missing active credits from the output cost model", async () => {
    const { guard } = fixture("credits", {
      costModel: { unit: "credits", cost: () => ({ cost: { tokens: 1 } }) },
    });
    await expect(guard.onChunk("abcd")).rejects.toBeInstanceOf(TypeError);
  });

  it.each([NaN, -1, Infinity])(
    "rejects invalid budget state rather than continuing (%s)",
    (value) => {
      expect(() => fixture("tokens", { budget: { tokens: value } })).toThrow(RangeError);
    },
  );

  it("rejects absent active credits in supplied state", () => {
    expect(() => fixture("credits", { used: { tokens: 0 } })).toThrow(TypeError);
  });

  it("wraps output tokenizer rejection with a safe typed error", async () => {
    const { guard, model } = fixture();
    const cause = new Error("private tokenizer detail");
    vi.spyOn(model, "countTokens").mockRejectedValue(cause);
    await expect(guard.onChunk("x".repeat(400))).rejects.toMatchObject({
      name: "CountError",
      cause,
      message: "Q0T4 couldn't count output tokens.",
    });
  });

  it("propagates final recount failure rather than returning an estimate", async () => {
    const { guard, model } = fixture();
    await guard.onChunk("small reply");
    vi.spyOn(model, "countTokens").mockRejectedValue(new Error("private final failure"));
    await expect(guard.finalCount()).rejects.toBeInstanceOf(CountError);
  });

  it("keeps pre-cancelled guards from counting or cancelling the model again", async () => {
    const { guard, model, signal, cancel } = fixture();
    signal.cancel();
    await expect(guard.onChunk("x".repeat(400))).rejects.toBeInstanceOf(Cancelled);
    expect(model.calls.countTokens).toEqual([]);
    expect(cancel).not.toHaveBeenCalled();
  });

  it.each(["estimate", "recount"] as const)(
    "observes cancellation during %s cost conversion without claiming a budget stop",
    async (phase) => {
      const { guard, signal, costModel, cancel } = fixture();
      const original = costModel.cost.bind(costModel);
      if (phase === "recount") await guard.onChunk("abcd");
      vi.spyOn(costModel, "cost").mockImplementation((model, tokens) => {
        signal.cancel();
        return original(model, tokens);
      });
      const operation = phase === "estimate" ? guard.onChunk("abcd") : guard.finalCount();
      await expect(operation).rejects.toBeInstanceOf(Cancelled);
      expect(guard.stopped).toBe(false);
      expect(cancel).not.toHaveBeenCalled();
    },
  );

  it("stops waiting for a pending output count on user cancellation and observes late failure", async () => {
    const { guard, model, signal } = fixture();
    let reject!: (reason: unknown) => void;
    const pending = new Promise<number>((_resolve, rejectPromise) => {
      reject = rejectPromise;
    });
    const count = vi.spyOn(model, "countTokens").mockReturnValue(pending);
    const operation = guard.onChunk("x".repeat(400));
    expect(count).toHaveBeenCalledOnce();
    const result = expect(operation).rejects.toBeInstanceOf(Cancelled);
    signal.cancel();
    await result;
    reject(new Error("late private error"));
    await new Promise<void>((resolve) => setImmediate(resolve));
  });
});

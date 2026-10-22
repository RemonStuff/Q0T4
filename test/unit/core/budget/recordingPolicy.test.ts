import { describe, expect, it } from "vitest";
import { recordingPolicy } from "../../../../src/core/budget/recordingPolicy";
import type { RecordingInput, RecordingOutcome } from "../../../../src/core/budget/recordingPolicy";
import { TokenCostModel } from "../../../../src/core/cost/tokenCostModel";
import { isLedgerEntry } from "../../../../src/core/types";
import type { BudgetUnit } from "../../../../src/core/types";
import { FixedRateCostModel } from "../../../fakes";

const MODEL = { name: "GPT-5", family: "gpt-5" };

function input(
  unit: BudgetUnit,
  outcome: RecordingOutcome,
  overrides: Partial<RecordingInput> = {},
): RecordingInput {
  return {
    outcome,
    subject: "org/repo",
    model: MODEL,
    inputTokens: 1000,
    outputTokens: 250,
    costModel:
      unit === "tokens" ? new TokenCostModel() : new FixedRateCostModel({ input: 2, output: 10 }),
    id: "entry-1",
    at: new Date("2026-10-14T09:12:03.120Z"),
    timeZone: "UTC",
    ...overrides,
  };
}

describe.each(["tokens", "credits"] as const)("recordingPolicy (%s)", (unit) => {
  it("records input and output on success", () => {
    const entry = recordingPolicy(input(unit, "completed"));
    expect(entry).toMatchObject({
      kind: "usage",
      tokens: { input: 1000, output: 250 },
      cost: { tokens: 1250 },
      stopped: false,
    });
  });

  it("records input and output so far when the user cancels", () => {
    const entry = recordingPolicy(input(unit, "cancelled", { outputTokens: 40 }));
    expect(entry).toMatchObject({
      kind: "usage",
      tokens: { input: 1000, output: 40 },
      cost: { tokens: 1040 },
      stopped: true,
    });
  });

  it("records input and output so far when the stream throws mid-way", () => {
    const entry = recordingPolicy(input(unit, "failed", { outputTokens: 12 }));
    expect(entry).toMatchObject({
      kind: "usage",
      tokens: { input: 1000, output: 12 },
      cost: { tokens: 1012 },
      stopped: false,
    });
  });

  it("records input and output when StreamGuard stops the reply", () => {
    const entry = recordingPolicy(input(unit, "budgetStopped", { outputTokens: 300 }));
    expect(entry).toMatchObject({
      kind: "usage",
      tokens: { input: 1000, output: 300 },
      cost: { tokens: 1300 },
      stopped: true,
    });
  });

  it("records nothing for the model call when sendRequest rejects before streaming", () => {
    expect(recordingPolicy(input(unit, "requestRejected", { outputTokens: 0 }))).toBeNull();
  });

  it("records nothing when the pre-check refuses", () => {
    expect(recordingPolicy(input(unit, "refused", { outputTokens: 0 }))).toBeNull();
  });

  it("produces an entry that passes the ledger validation", () => {
    expect(isLedgerEntry(recordingPolicy(input(unit, "completed")))).toBe(true);
  });
});

describe("recordingPolicy entry contents", () => {
  it("carries raw tokens, model name and family, subject, and source q0t4", () => {
    const entry = recordingPolicy(input("tokens", "completed"));
    expect(entry).toMatchObject({
      v: 1,
      id: "entry-1",
      subject: "org/repo",
      source: "q0t4",
      model: { name: "GPT-5", family: "gpt-5" },
      tokens: { input: 1000, output: 250 },
    });
  });

  it("stamps the instant and the local day in the clock's time zone", () => {
    const late = new Date("2026-10-14T23:30:00.000Z");
    expect(recordingPolicy(input("tokens", "completed", { at: late }))).toMatchObject({
      at: "2026-10-14T23:30:00.000Z",
      day: "2026-10-14",
    });
    expect(
      recordingPolicy(input("tokens", "completed", { at: late, timeZone: "Europe/Amsterdam" })),
    ).toMatchObject({ day: "2026-10-15" });
  });

  it("carries the rate snapshot it was costed with (credits)", () => {
    const entry = recordingPolicy(input("credits", "completed"));
    expect(entry).toMatchObject({
      rates: { input: 2, output: 10, tier: "Default", tableSource: "fixed-rate-test" },
    });
  });

  it("always carries cost.tokens, and cost.credits only when rates are known", () => {
    const tokens = recordingPolicy(input("tokens", "completed"));
    expect(tokens).toMatchObject({ cost: { tokens: 1250 } });
    expect(tokens).not.toHaveProperty("rates");
    if (tokens?.kind !== "usage") throw new Error("expected a usage entry");
    expect(tokens.cost).not.toHaveProperty("credits");

    const credits = recordingPolicy(input("credits", "completed"));
    if (credits?.kind !== "usage") throw new Error("expected a usage entry");
    expect(credits.cost.tokens).toBe(1250);
    expect(credits.cost.credits).toBeCloseTo(((1000 * 2 + 250 * 10) / 1e6) * 100);
  });

  it("does not modify its input", () => {
    const given = input("credits", "completed");
    const copy = structuredClone({ ...given, costModel: undefined });
    recordingPolicy(given);
    expect({ ...given, costModel: undefined }).toEqual(copy);
  });
});

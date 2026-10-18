import { describe, expect, it } from "vitest";
import { isLedgerEntry, isResultMetadata } from "../../../src/core/types";
import type { BudgetUnit, LedgerEntry, ResultMetadata } from "../../../src/core/types";

const roundTrip = <T>(value: T): unknown => JSON.parse(JSON.stringify(value));

const metadata = (unit: BudgetUnit): ResultMetadata => ({
  v: 1,
  subject: "RemonStuff/Q0T4",
  model: "GPT-5 mini",
  unit,
  inputTokens: 1200,
  outputTokens: 340,
  cost: unit === "credits" ? { tokens: 1540, credits: 0.1 } : { tokens: 1540 },
  stopped: false,
});

const usageEntry: LedgerEntry = {
  v: 1,
  id: "6f1c0b8e",
  kind: "usage",
  at: "2026-10-14T09:12:03.120Z",
  day: "2026-10-14",
  subject: "RemonStuff/Q0T4",
  source: "q0t4",
  model: { name: "Claude Sonnet 5.5", family: "claude-sonnet-5.5" },
  tokens: { input: 41200, output: 1880 },
  rates: {
    input: 2,
    output: 10,
    tier: "Default",
    tableDate: "2026-10-13T06:00:00Z",
    tableSource: "github-docs-yaml",
  },
  cost: { tokens: 43080, credits: 10.12 },
  stopped: false,
};

describe("ResultMetadata", () => {
  it("ResultMetadata round-trips through JSON.stringify/parse unchanged", () => {
    const value = metadata("credits");
    expect(roundTrip(value)).toEqual(value);
  });

  it.each<BudgetUnit>(["tokens", "credits"])(
    "isResultMetadata accepts a valid v1 object in each unit (%s)",
    (unit) => {
      expect(isResultMetadata(roundTrip(metadata(unit)))).toBe(true);
    },
  );

  it("isResultMetadata accepts metadata without a model (no model was called)", () => {
    const { model: _model, ...withoutModel } = metadata("tokens");
    expect(isResultMetadata({ ...withoutModel, stopped: "precheck" })).toBe(true);
  });

  it.each([
    ["missing subject", { subject: undefined }],
    ["empty subject", { subject: "" }],
    ["wrong version", { v: 2 }],
    ["unknown unit", { unit: "dollars" }],
    ["non-numeric inputTokens", { inputTokens: "12" }],
    ["negative outputTokens", { outputTokens: -1 }],
    ["non-numeric cost", { cost: { tokens: "1" } }],
    ["unknown stopped reason", { stopped: "maybe" }],
  ])("isResultMetadata rejects %s", (_label, patch) => {
    expect(isResultMetadata({ ...metadata("tokens"), ...patch })).toBe(false);
  });

  it.each([null, undefined, 42, "metadata", []])("isResultMetadata rejects %j", (value) => {
    expect(isResultMetadata(value)).toBe(false);
  });
});

describe("LedgerEntry", () => {
  it("LedgerEntry round-trips through JSON unchanged", () => {
    expect(roundTrip(usageEntry)).toEqual(usageEntry);
  });

  it("isLedgerEntry accepts a valid usage entry with credits", () => {
    expect(isLedgerEntry(roundTrip(usageEntry))).toBe(true);
  });

  it("isLedgerEntry accepts a valid usage entry without credits", () => {
    const { rates: _rates, ...tokensOnly } = usageEntry as Extract<LedgerEntry, { kind: "usage" }>;
    expect(isLedgerEntry({ ...tokensOnly, cost: { tokens: 43080 } })).toBe(true);
  });

  it("isLedgerEntry accepts a usage entry that borrowed from the reserve", () => {
    expect(isLedgerEntry({ ...usageEntry, borrowed: { tokens: 0, credits: 120 } })).toBe(true);
  });

  it("isLedgerEntry rejects a negative borrowed amount", () => {
    expect(isLedgerEntry({ ...usageEntry, borrowed: { tokens: 0, credits: -1 } })).toBe(false);
  });

  it("isLedgerEntry accepts an api source", () => {
    expect(isLedgerEntry({ ...usageEntry, source: "api:acme.multi-repo-chat" })).toBe(true);
  });

  it.each<[string, Record<string, unknown>]>([
    ["reset", { kind: "reset" }],
    [
      "untracked with a negative credit correction",
      { kind: "untracked", source: "untracked", cost: { tokens: 0, credits: -120 } },
    ],
    ["budget", { kind: "budget", week: "2026-10-12", unit: "credits", amount: 3390 }],
    ["reserve-grant", { kind: "reserve-grant", week: "2026-10-12" }],
  ])("isLedgerEntry accepts a %s entry", (_label, fields) => {
    const base = {
      v: 1,
      id: "a1",
      at: "2026-10-14T09:00:00Z",
      day: "2026-10-14",
      subject: "RemonStuff/Q0T4",
      source: "q0t4",
    };
    expect(isLedgerEntry({ ...base, ...fields })).toBe(true);
  });

  it.each([
    ["an unknown kind", { kind: "refund" }],
    ["a missing subject", { subject: undefined }],
    ["a missing day", { day: undefined }],
    ["a malformed day", { day: "14-10-2026" }],
    ["a malformed timestamp", { at: "yesterday" }],
    ["negative input tokens", { tokens: { input: -1, output: 0 } }],
    ["negative output tokens", { tokens: { input: 0, output: -5 } }],
    ["an unknown source", { source: "someone" }],
    ["an empty api source", { source: "api:" }],
    ["a wrong version", { v: 2 }],
    ["a model without a name", { model: { family: "gpt-5-mini" } }],
  ])("isLedgerEntry rejects %s", (_label, patch) => {
    expect(isLedgerEntry({ ...usageEntry, ...patch })).toBe(false);
  });

  it.each([null, 7, "entry", []])("isLedgerEntry rejects %j", (value) => {
    expect(isLedgerEntry(value)).toBe(false);
  });
});

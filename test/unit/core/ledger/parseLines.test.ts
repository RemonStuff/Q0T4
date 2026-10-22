import { describe, expect, it } from "vitest";
import { parseLedgerLines } from "../../../../src/core/ledger/parseLines";
import type { LedgerEntry } from "../../../../src/core/types";

function usage(id: string, day = "2026-10-14"): LedgerEntry {
  return {
    v: 1,
    id,
    kind: "usage",
    at: `${day}T09:00:00.000Z`,
    day,
    subject: "org/repo",
    source: "q0t4",
    model: { name: "GPT-5", family: "gpt-5" },
    tokens: { input: 1, output: 1 },
    cost: { tokens: 2 },
    stopped: false,
  };
}

const line = (entry: LedgerEntry) => JSON.stringify(entry);

describe("parseLedgerLines", () => {
  it("parses one entry per line", () => {
    const text = `${line(usage("a"))}\n${line(usage("b"))}\n`;
    const { entries, corrupt } = parseLedgerLines(text);
    expect(entries.map((e) => e.id)).toEqual(["a", "b"]);
    expect(corrupt).toBe(0);
  });

  it("returns nothing for empty text", () => {
    expect(parseLedgerLines("")).toEqual({ entries: [], corrupt: 0 });
    expect(parseLedgerLines("\n\n")).toEqual({ entries: [], corrupt: 0 });
  });

  it("skips and counts unparseable lines", () => {
    const { entries, corrupt } = parseLedgerLines(`{not json\n${line(usage("a"))}\n]]\n`);
    expect(entries.map((e) => e.id)).toEqual(["a"]);
    expect(corrupt).toBe(2);
  });

  it("skips and counts lines that fail validation, including an unknown schema version", () => {
    const future = JSON.stringify({ ...usage("a"), v: 2 });
    const refund = JSON.stringify({ v: 1, kind: "refund" });
    const { entries, corrupt } = parseLedgerLines(`${future}\n${refund}\n${line(usage("b"))}\n`);
    expect(entries.map((e) => e.id)).toEqual(["b"]);
    expect(corrupt).toBe(2);
  });

  it("ignores blank lines and Windows line endings", () => {
    const text = `${line(usage("a"))}\r\n\r\n${line(usage("b"))}\r\n`;
    const { entries, corrupt } = parseLedgerLines(text);
    expect(entries.map((e) => e.id)).toEqual(["a", "b"]);
    expect(corrupt).toBe(0);
  });

  it("ignores a last line that has no newline yet: another window is still writing it", () => {
    const text = `${line(usage("a"))}\n${line(usage("b")).slice(0, 20)}`;
    const { entries, corrupt } = parseLedgerLines(text);
    expect(entries.map((e) => e.id)).toEqual(["a"]);
    expect(corrupt).toBe(0);
  });

  it("does not treat a complete last line without a newline as unfinished when it is the only one", () => {
    // A writer always ends its line with a newline, so an unterminated tail is never trusted.
    expect(parseLedgerLines(line(usage("a")))).toEqual({ entries: [], corrupt: 0 });
  });
});

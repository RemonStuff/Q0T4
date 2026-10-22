import { describe, expect, it } from "vitest";
import type { LedgerEntry } from "../../src/core/types";
import type { PriceTable } from "../../src/core/pricing/priceTable";
import { InMemoryLedger, InMemoryPriceTableStore, InMemoryStorage } from "./index";

describe("InMemoryStorage", () => {
  it("get returns undefined for a missing key", () => {
    expect(new InMemoryStorage().get("q0t4.ui.lastSubject")).toBeUndefined();
  });

  it("get returns a deep copy, not the stored reference", async () => {
    const storage = new InMemoryStorage();
    const value = { subject: "RemonStuff/Q0T4", nested: { n: 1 } };
    await storage.set("k", value);
    value.nested.n = 2;
    const read = storage.get<typeof value>("k");
    expect(read).toEqual({ subject: "RemonStuff/Q0T4", nested: { n: 1 } });
    read!.nested.n = 3;
    expect(storage.get<typeof value>("k")?.nested.n).toBe(1);
  });

  it("keys lists stored keys", async () => {
    const storage = new InMemoryStorage();
    await storage.set("a", 1);
    await storage.set("b", 2);
    expect([...storage.keys()].sort()).toEqual(["a", "b"]);
  });

  it("set rejects when a write failure is injected", async () => {
    const storage = new InMemoryStorage();
    storage.failWrites = true;
    await expect(storage.set("a", 1)).rejects.toThrow(/write failure/);
    expect(storage.get("a")).toBeUndefined();
  });
});

const entry = (id: string, day: string, at: string): LedgerEntry => ({
  v: 1,
  id,
  kind: "reset",
  at,
  day,
  subject: "RemonStuff/Q0T4",
  source: "q0t4",
});

describe("InMemoryLedger", () => {
  it("append then read returns the entry in a date range", async () => {
    const ledger = new InMemoryLedger();
    const e = entry("a", "2026-10-14", "2026-10-14T09:00:00Z");
    await ledger.append(e);
    expect(await ledger.read({ from: "2026-10-12", to: "2026-10-19" })).toEqual({
      entries: [e],
      corrupt: 0,
    });
    expect((await ledger.read({ from: "2026-10-15", to: "2026-10-19" })).entries).toEqual([]);
    expect((await ledger.read({ from: "2026-10-01", to: "2026-10-14" })).entries).toEqual([]);
  });

  it("read merges entries from several writer streams in time order", async () => {
    const windowA = new InMemoryLedger("window-a");
    const windowB = windowA.writer("window-b");
    const first = entry("1", "2026-10-14", "2026-10-14T09:00:00Z");
    const second = entry("2", "2026-10-14", "2026-10-14T09:05:00Z");
    const third = entry("3", "2026-10-15", "2026-10-15T08:00:00Z");
    await windowA.append(third);
    await windowB.append(second);
    await windowA.append(first);
    const { entries } = await windowB.read({ from: "2026-10-12", to: "2026-10-19" });
    expect(entries.map((e) => e.id)).toEqual(["1", "2", "3"]);
    expect(windowA.linesOf("window-b")).toHaveLength(1);
  });

  it("read skips injected corrupt lines and reports how many", async () => {
    const ledger = new InMemoryLedger();
    await ledger.append(entry("a", "2026-10-14", "2026-10-14T09:00:00Z"));
    ledger.injectCorruptLine("{not json");
    ledger.injectCorruptLine(JSON.stringify({ v: 1, kind: "refund" }));
    const result = await ledger.read({ from: "2026-10-12", to: "2026-10-19" });
    expect(result.entries.map((e) => e.id)).toEqual(["a"]);
    expect(result.corrupt).toBe(2);
  });

  it("months lists the months that have entries, sorted and once", async () => {
    const ledger = new InMemoryLedger("window-a");
    const other = ledger.writer("window-b");
    await ledger.append(entry("1", "2026-10-14", "2026-10-14T09:00:00Z"));
    await other.append(entry("2", "2026-09-30", "2026-09-30T09:00:00Z"));
    await other.append(entry("3", "2026-10-02", "2026-10-02T09:00:00Z"));
    expect(await ledger.months()).toEqual(["2026-09", "2026-10"]);
    expect(await new InMemoryLedger().months()).toEqual([]);
  });

  it("removeMonth drops that month's entries from every writer and keeps the rest", async () => {
    const ledger = new InMemoryLedger("window-a");
    const other = ledger.writer("window-b");
    await ledger.append(entry("1", "2026-10-14", "2026-10-14T09:00:00Z"));
    await other.append(entry("2", "2026-09-30", "2026-09-30T09:00:00Z"));
    await ledger.append(entry("3", "2026-09-01", "2026-09-01T09:00:00Z"));
    await ledger.removeMonth("2026-09");
    const { entries } = await ledger.read({ from: "2026-01-01", to: "2027-01-01" });
    expect(entries.map((e) => e.id)).toEqual(["1"]);
    expect(await ledger.months()).toEqual(["2026-10"]);
    await ledger.removeMonth("2025-01"); // absent: nothing happens
    expect(await ledger.months()).toEqual(["2026-10"]);
  });

  it("removeMonth rejects when a failure is injected", async () => {
    const ledger = new InMemoryLedger();
    await ledger.append(entry("1", "2026-09-14", "2026-09-14T09:00:00Z"));
    ledger.failRemovals = true;
    await expect(ledger.removeMonth("2026-09")).rejects.toThrow(/removal failure/);
    expect(await ledger.months()).toEqual(["2026-09"]);
  });

  it("append rejects when a write failure is injected", async () => {
    const ledger = new InMemoryLedger();
    ledger.failAppends = true;
    await expect(ledger.append(entry("a", "2026-10-14", "2026-10-14T09:00:00Z"))).rejects.toThrow(
      /append failure/,
    );
    expect(ledger.linesOf("writer-1")).toEqual([]);
  });
});

describe("InMemoryPriceTableStore", () => {
  it("InMemoryPriceTableStore load returns what save stored, as a copy", async () => {
    const store = new InMemoryPriceTableStore();
    expect(await store.load()).toBeUndefined();
    const table: PriceTable = {
      fetchedAt: "2026-10-18T06:00:00Z",
      source: "github-docs-yaml",
      models: [
        {
          model: "GPT-5 mini",
          provider: "openai",
          tiers: [{ tier: "Default", input: 0.25, output: 2 }],
        },
      ],
    };
    await store.save(table);
    const loaded = await store.load();
    expect(loaded).toEqual(table);
    expect(loaded).not.toBe(table);
  });
});

import { describe, expect, it } from "vitest";
import { TotalsStore } from "../../../../src/core/storage/totalsStore";
import type { Cost, LedgerEntry } from "../../../../src/core/types";
import { InMemoryStorage } from "../../../fakes";

function usage(subject: string, cost: Cost) {
  return {
    v: 1,
    id: "id",
    kind: "usage",
    at: "2026-10-14T09:12:03.120Z",
    day: "2026-10-14",
    subject,
    source: "q0t4",
    model: { name: "GPT-5", family: "gpt-5" },
    tokens: { input: 1, output: 1 },
    cost,
    stopped: false,
  } satisfies LedgerEntry;
}

describe("TotalsStore", () => {
  it("adds usage to the subject total", async () => {
    const store = new TotalsStore(new InMemoryStorage());
    await store.add("org/repo", { tokens: 100 });
    await store.add("org/repo", { tokens: 50 });
    expect(store.get("org/repo")).toEqual({ tokens: 150 });
  });

  it("returns 0 for an unknown subject", () => {
    expect(new TotalsStore(new InMemoryStorage()).get("nobody")).toEqual({ tokens: 0 });
  });

  it("keeps a separate total per subject", async () => {
    const store = new TotalsStore(new InMemoryStorage());
    await store.add("a/one", { tokens: 5 });
    await store.add("b/two", { tokens: 7 });
    expect(store.get("a/one")).toEqual({ tokens: 5 });
    expect(store.get("b/two")).toEqual({ tokens: 7 });
  });

  it("adds credits only once some usage has credits", async () => {
    const store = new TotalsStore(new InMemoryStorage());
    await store.add("org/repo", { tokens: 10 });
    expect(store.get("org/repo")).not.toHaveProperty("credits");
    await store.add("org/repo", { tokens: 20, credits: 1.5 });
    await store.add("org/repo", { tokens: 30, credits: 0.25 });
    expect(store.get("org/repo")).toEqual({ tokens: 60, credits: 1.75 });
  });

  it("keeps the credits already counted when a later cost has none", async () => {
    const store = new TotalsStore(new InMemoryStorage());
    await store.add("org/repo", { tokens: 10, credits: 2 });
    await store.add("org/repo", { tokens: 5 });
    expect(store.get("org/repo")).toEqual({ tokens: 15, credits: 2 });
  });

  it("keeps every increment when requests finish at the same time", async () => {
    const store = new TotalsStore(new InMemoryStorage());
    await Promise.all(Array.from({ length: 20 }, () => store.add("org/repo", { tokens: 1 })));
    expect(store.get("org/repo")).toEqual({ tokens: 20 });
  });

  it("keeps its totals when the storage echoes an older value back", async () => {
    // VS Code's globalState can replace a newer pending value with a stale echo of an earlier write.
    const storage = new InMemoryStorage();
    const store = new TotalsStore(storage);
    await store.add("org/repo", { tokens: 10 });
    await store.add("org/repo", { tokens: 5 });
    await storage.set("q0t4.totals", { "org/repo": { tokens: 10 } });
    expect(store.get("org/repo")).toEqual({ tokens: 15 });
    await store.add("org/repo", { tokens: 1 });
    expect(store.get("org/repo")).toEqual({ tokens: 16 });
    expect(new TotalsStore(storage).get("org/repo")).toEqual({ tokens: 16 });
  });

  it("shows an increment at once, before its write has finished", async () => {
    const store = new TotalsStore(new InMemoryStorage());
    const writing = store.add("org/repo", { tokens: 3 });
    await Promise.resolve();
    await writing;
    expect(store.get("org/repo")).toEqual({ tokens: 3 });
  });

  it("persists across a new store over the same storage", async () => {
    const storage = new InMemoryStorage();
    await new TotalsStore(storage).add("org/repo", { tokens: 42 });
    expect(new TotalsStore(storage).get("org/repo")).toEqual({ tokens: 42 });
  });

  it("records usage entries as a UsageSink and ignores other entry kinds", async () => {
    const store = new TotalsStore(new InMemoryStorage());
    await store.record(usage("org/repo", { tokens: 12 }));
    await store.record({
      v: 1,
      id: "id2",
      kind: "reset",
      at: "2026-10-14T09:12:03.120Z",
      day: "2026-10-14",
      subject: "org/repo",
      source: "q0t4",
    });
    expect(store.get("org/repo")).toEqual({ tokens: 12 });
  });

  it("ignores damaged stored data instead of throwing", () => {
    const storage = new InMemoryStorage();
    for (const bad of ["text", 5, null, [1], { "org/repo": "x" }, { "org/repo": { tokens: -1 } }]) {
      storage.set("q0t4.totals", bad);
      expect(new TotalsStore(storage).get("org/repo")).toEqual({ tokens: 0 });
    }
  });

  it("keeps valid subjects when another stored subject is damaged", async () => {
    const storage = new InMemoryStorage();
    await storage.set("q0t4.totals", { good: { tokens: 3 }, bad: { tokens: "x" } });
    const store = new TotalsStore(storage);
    await store.add("good", { tokens: 4 });
    expect(store.get("good")).toEqual({ tokens: 7 });
    expect(store.get("bad")).toEqual({ tokens: 0 });
  });

  it("loads stored credits, and ignores a subject whose stored credits are damaged", () => {
    const storage = new InMemoryStorage();
    storage.set("q0t4.totals", {
      good: { tokens: 3, credits: 1.5 },
      bad: { tokens: 3, credits: "x" },
    });
    const store = new TotalsStore(storage);
    expect(store.get("good")).toEqual({ tokens: 3, credits: 1.5 });
    expect(store.get("bad")).toEqual({ tokens: 0 });
  });

  it("keeps working after a failed write, and does not count the failed increment", async () => {
    const storage = new InMemoryStorage();
    const store = new TotalsStore(storage);
    await store.add("org/repo", { tokens: 1 });
    storage.failWrites = true;
    await expect(store.add("org/repo", { tokens: 10 })).rejects.toThrow("injected write failure");
    storage.failWrites = false;
    await store.add("org/repo", { tokens: 2 });
    expect(store.get("org/repo")).toEqual({ tokens: 3 });
  });
});

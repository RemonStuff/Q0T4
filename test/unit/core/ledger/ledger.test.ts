import { describe, expect, it } from "vitest";
import { Ledger } from "../../../../src/core/ledger/ledger";
import { BudgetCalendar } from "../../../../src/core/time/budgetCalendar";
import type { Cost, LedgerEntry } from "../../../../src/core/types";
import { isLedgerEntry } from "../../../../src/core/types";
import { FixedClock, InMemoryLedger } from "../../../fakes";

// Wednesday 14 Oct 2026, a Monday-reset week starting 12 Oct.
const NOW = "2026-10-14T09:00:00.000Z";

function setup(resetDay: "monday" | "wednesday" = "monday", store = new InMemoryLedger()) {
  const clock = new FixedClock(NOW, "UTC");
  const calendar = new BudgetCalendar(clock, resetDay);
  let n = 0;
  const ledger = new Ledger(store, clock, calendar, () => `id-${++n}`);
  return { store, clock, ledger };
}

function usage(
  subject: string,
  at: string,
  cost: Cost,
  overrides: Partial<Extract<LedgerEntry, { kind: "usage" }>> = {},
): LedgerEntry {
  return {
    v: 1,
    id: `${subject}-${at}`,
    kind: "usage",
    at,
    day: at.slice(0, 10),
    subject,
    source: "q0t4",
    model: { name: "GPT-5", family: "gpt-5" },
    tokens: { input: 1, output: 1 },
    cost,
    stopped: false,
    ...overrides,
  };
}

describe("Ledger.record", () => {
  it("appends a usage entry with subject, day, tokens, model, cost and source", async () => {
    const { ledger, store } = setup();
    const entry = usage("org/repo", "2026-10-14T08:00:00.000Z", { tokens: 12 });
    await ledger.record(entry);
    const [line] = store.linesOf("writer-1");
    expect(JSON.parse(line ?? "")).toMatchObject({
      kind: "usage",
      subject: "org/repo",
      day: "2026-10-14",
      tokens: { input: 1, output: 1 },
      model: { name: "GPT-5", family: "gpt-5" },
      cost: { tokens: 12 },
      source: "q0t4",
    });
  });

  it("never rewrites existing entries", async () => {
    const { ledger, store } = setup();
    await ledger.record(usage("org/repo", "2026-10-14T08:00:00.000Z", { tokens: 1 }));
    const first = [...store.linesOf("writer-1")];
    await ledger.record(usage("org/repo", "2026-10-14T08:01:00.000Z", { tokens: 2 }));
    await ledger.markReset("org/repo");
    const after = store.linesOf("writer-1");
    expect(after).toHaveLength(3);
    expect(after.slice(0, 1)).toEqual(first);
  });

  it("rejects an entry that is not a valid ledger entry, without writing", async () => {
    const { ledger, store } = setup();
    await expect(ledger.record({ kind: "usage" } as unknown as LedgerEntry)).rejects.toThrow(
      TypeError,
    );
    expect(store.linesOf("writer-1")).toEqual([]);
  });

  it("passes on a failed append", async () => {
    const { ledger, store } = setup();
    store.failAppends = true;
    await expect(
      ledger.record(usage("org/repo", "2026-10-14T08:00:00.000Z", { tokens: 1 })),
    ).rejects.toThrow("injected append failure");
  });
});

describe("Ledger totals", () => {
  it("usedInRange sums cost for one subject over [from, to)", async () => {
    const { ledger } = setup();
    for (const [at, tokens] of [
      ["2026-10-11T23:59:00.000Z", 1000],
      ["2026-10-12T00:00:00.000Z", 1],
      ["2026-10-13T12:00:00.000Z", 2],
      ["2026-10-14T00:00:00.000Z", 4],
    ] as const) {
      await ledger.record(usage("org/repo", at, { tokens }));
    }
    expect(await ledger.usedInRange("org/repo", "2026-10-12", "2026-10-14")).toEqual({ tokens: 3 });
    expect(await ledger.usedInRange("org/repo", "2026-10-12", "2026-10-15")).toEqual({ tokens: 7 });
  });

  it("usedThisWeek sums every entry in the current week window", async () => {
    const { ledger } = setup();
    await ledger.record(usage("org/repo", "2026-10-11T22:00:00.000Z", { tokens: 100 }));
    await ledger.record(usage("org/repo", "2026-10-12T00:00:00.000Z", { tokens: 1 }));
    await ledger.record(usage("org/repo", "2026-10-14T08:00:00.000Z", { tokens: 2 }));
    await ledger.record(usage("org/repo", "2026-10-18T23:00:00.000Z", { tokens: 4 }));
    await ledger.record(usage("org/repo", "2026-10-19T00:00:00.000Z", { tokens: 100 }));
    expect(await ledger.usedThisWeek("org/repo")).toEqual({ tokens: 7 });
  });

  it("usedThisWeek is 0 at the start of a new week", async () => {
    const { ledger, clock } = setup();
    await ledger.record(usage("org/repo", "2026-10-18T23:00:00.000Z", { tokens: 50 }));
    expect(await ledger.usedThisWeek("org/repo")).toEqual({ tokens: 50 });
    clock.set("2026-10-19T00:00:00.000Z");
    expect(await ledger.usedThisWeek("org/repo")).toEqual({ tokens: 0 });
  });

  it("usedToday returns only today's entries", async () => {
    const { ledger } = setup();
    await ledger.record(usage("org/repo", "2026-10-13T23:59:00.000Z", { tokens: 100 }));
    await ledger.record(usage("org/repo", "2026-10-14T00:00:00.000Z", { tokens: 1 }));
    await ledger.record(usage("org/repo", "2026-10-14T08:30:00.000Z", { tokens: 2 }));
    await ledger.record(usage("org/repo", "2026-10-15T00:00:00.000Z", { tokens: 100 }));
    expect(await ledger.usedToday("org/repo")).toEqual({ tokens: 3 });
  });

  it("usedToday follows the local day, not the UTC day", async () => {
    const store = new InMemoryLedger();
    const clock = new FixedClock("2026-10-14T23:30:00.000Z", "Asia/Tokyo"); // 15 Oct 08:30 local
    const calendar = new BudgetCalendar(clock, "monday");
    const ledger = new Ledger(store, clock, calendar, () => "id");
    await ledger.record(
      usage("org/repo", "2026-10-14T20:00:00.000Z", { tokens: 5 }, { day: "2026-10-15" }),
    );
    await ledger.record(
      usage("org/repo", "2026-10-14T10:00:00.000Z", { tokens: 100 }, { day: "2026-10-14" }),
    );
    expect(await ledger.usedToday("org/repo")).toEqual({ tokens: 5 });
  });

  it("entries from other subjects are not counted", async () => {
    const { ledger } = setup();
    await ledger.record(usage("org/repo", "2026-10-14T08:00:00.000Z", { tokens: 1 }));
    await ledger.record(usage("org/other", "2026-10-14T08:00:00.000Z", { tokens: 100 }));
    expect(await ledger.usedThisWeek("org/repo")).toEqual({ tokens: 1 });
    expect(await ledger.usedThisWeek("nobody")).toEqual({ tokens: 0 });
  });

  it('subjects match case-insensitively, so "remonstuff/q0t4" and "RemonStuff/Q0T4" share one budget', async () => {
    const { ledger } = setup();
    await ledger.record(usage("RemonStuff/Q0T4", "2026-10-14T08:00:00.000Z", { tokens: 3 }));
    await ledger.record(usage("remonstuff/q0t4", "2026-10-14T09:00:00.000Z", { tokens: 4 }));
    expect(await ledger.usedThisWeek("REMONSTUFF/q0t4")).toEqual({ tokens: 7 });
  });

  it("totals are returned in tokens, and in credits when entries carry credit costs", async () => {
    const { ledger } = setup();
    await ledger.record(usage("org/repo", "2026-10-14T08:00:00.000Z", { tokens: 10 }));
    expect(await ledger.usedThisWeek("org/repo")).toEqual({ tokens: 10 });
    await ledger.record(
      usage("org/repo", "2026-10-14T08:01:00.000Z", { tokens: 20, credits: 1.5 }),
    );
    await ledger.record(
      usage("org/repo", "2026-10-14T08:02:00.000Z", { tokens: 30, credits: 0.25 }),
    );
    expect(await ledger.usedThisWeek("org/repo")).toEqual({ tokens: 60, credits: 1.75 });
  });

  it("entries from several writers are merged", async () => {
    const store = new InMemoryLedger("window-a");
    const { ledger } = setup("monday", store);
    const other = setup("monday", store.writer("window-b")).ledger;
    await ledger.record(usage("org/repo", "2026-10-14T08:00:00.000Z", { tokens: 1 }));
    await other.record(usage("org/repo", "2026-10-14T08:01:00.000Z", { tokens: 2 }));
    await ledger.record(usage("org/repo", "2026-10-14T08:02:00.000Z", { tokens: 4 }));
    expect(await ledger.usedThisWeek("org/repo")).toEqual({ tokens: 7 });
    expect(await other.usedThisWeek("org/repo")).toEqual({ tokens: 7 });
  });

  it("ignores entry kinds that are not usage when summing", async () => {
    const { ledger, store } = setup();
    await ledger.record(usage("org/repo", "2026-10-14T08:00:00.000Z", { tokens: 5 }));
    await store.append({
      v: 1,
      id: "u1",
      kind: "untracked",
      at: "2026-10-14T08:01:00.000Z",
      day: "2026-10-14",
      subject: "org/repo",
      source: "untracked",
      cost: { tokens: 1000 },
    });
    expect(await ledger.usedInRange("org/repo", "2026-10-12", "2026-10-19")).toEqual({ tokens: 5 });
  });
});

describe("Ledger reset markers", () => {
  it("a reset marker excludes earlier entries of that subject from this week's total", async () => {
    const { ledger, clock } = setup();
    await ledger.record(usage("org/repo", "2026-10-13T08:00:00.000Z", { tokens: 100 }));
    clock.set("2026-10-14T08:30:00.000Z");
    await ledger.markReset("org/repo");
    clock.set("2026-10-14T09:00:00.000Z");
    await ledger.record(usage("org/repo", "2026-10-14T08:45:00.000Z", { tokens: 5 }));
    expect(await ledger.usedThisWeek("org/repo")).toEqual({ tokens: 5 });
  });

  it("the latest reset marker wins", async () => {
    const { ledger, clock } = setup();
    await ledger.record(usage("org/repo", "2026-10-13T08:00:00.000Z", { tokens: 100 }));
    clock.set("2026-10-14T08:00:00.000Z");
    await ledger.markReset("org/repo");
    await ledger.record(usage("org/repo", "2026-10-14T08:10:00.000Z", { tokens: 20 }));
    clock.set("2026-10-14T08:30:00.000Z");
    await ledger.markReset("org/repo");
    await ledger.record(usage("org/repo", "2026-10-14T08:40:00.000Z", { tokens: 3 }));
    expect(await ledger.usedThisWeek("org/repo")).toEqual({ tokens: 3 });
  });

  it("a reset marker does not affect other subjects or other weeks", async () => {
    const { ledger, clock } = setup();
    await ledger.record(usage("org/other", "2026-10-13T08:00:00.000Z", { tokens: 7 }));
    await ledger.record(usage("org/repo", "2026-10-13T08:00:00.000Z", { tokens: 100 }));
    clock.set("2026-10-14T08:30:00.000Z");
    await ledger.markReset("org/repo");
    expect(await ledger.usedThisWeek("org/other")).toEqual({ tokens: 7 });
    expect(await ledger.usedThisWeek("org/repo")).toEqual({ tokens: 0 });
    // Next week: the old marker is outside the new window and changes nothing.
    clock.set("2026-10-20T09:00:00.000Z");
    await ledger.record(usage("org/repo", "2026-10-20T08:00:00.000Z", { tokens: 9 }));
    expect(await ledger.usedThisWeek("org/repo")).toEqual({ tokens: 9 });
  });

  it("a reset marker does not change a range total (the credits really were spent)", async () => {
    const { ledger, clock } = setup();
    await ledger.record(usage("org/repo", "2026-10-13T08:00:00.000Z", { tokens: 100 }));
    clock.set("2026-10-14T08:30:00.000Z");
    await ledger.markReset("org/repo");
    expect(await ledger.usedInRange("org/repo", "2026-10-12", "2026-10-19")).toEqual({
      tokens: 100,
    });
  });

  it("markReset appends a valid reset entry for the subject, on today's local day", async () => {
    const { ledger, store } = setup();
    await ledger.markReset("Org/Repo");
    const entry: unknown = JSON.parse(store.linesOf("writer-1")[0] ?? "");
    expect(isLedgerEntry(entry)).toBe(true);
    expect(entry).toMatchObject({
      kind: "reset",
      subject: "Org/Repo",
      day: "2026-10-14",
      at: NOW,
      source: "q0t4",
      id: "id-1",
    });
  });
});

describe("Ledger.subjectsSeen", () => {
  it("lists every subject with entries in the stored months, once, sorted", async () => {
    const { ledger } = setup();
    await ledger.record(usage("org/zeta", "2026-09-03T08:00:00.000Z", { tokens: 1 }));
    await ledger.record(usage("org/alpha", "2026-10-14T08:00:00.000Z", { tokens: 1 }));
    await ledger.record(usage("org/alpha", "2026-10-14T08:05:00.000Z", { tokens: 1 }));
    await ledger.markReset("org/mid");
    expect(await ledger.subjectsSeen()).toEqual(["org/alpha", "org/mid", "org/zeta"]);
  });

  it("merges subjects that differ only in case, keeping the latest spelling", async () => {
    const { ledger } = setup();
    await ledger.record(usage("remonstuff/q0t4", "2026-10-14T08:00:00.000Z", { tokens: 1 }));
    await ledger.record(usage("RemonStuff/Q0T4", "2026-10-14T09:00:00.000Z", { tokens: 1 }));
    expect(await ledger.subjectsSeen()).toEqual(["RemonStuff/Q0T4"]);
  });

  it("only lists subjects with entries on or after a given day", async () => {
    const { ledger } = setup();
    await ledger.record(usage("org/old", "2026-07-01T08:00:00.000Z", { tokens: 1 }));
    await ledger.record(usage("org/recent", "2026-10-01T08:00:00.000Z", { tokens: 1 }));
    expect(await ledger.subjectsSeen("2026-09-01")).toEqual(["org/recent"]);
    expect(await ledger.subjectsSeen("2026-06-01")).toEqual(["org/old", "org/recent"]);
    expect(await ledger.subjectsSeen()).toEqual(["org/old", "org/recent"]);
  });

  it("is empty for an empty ledger", async () => {
    expect(await setup().ledger.subjectsSeen()).toEqual([]);
  });
});

describe("Ledger resilience", () => {
  const range = ["2026-10-12", "2026-10-19"] as const;

  it("skips an unparseable line and still sums the valid ones", async () => {
    const { ledger, store } = setup();
    await ledger.record(usage("org/repo", "2026-10-14T08:00:00.000Z", { tokens: 5 }));
    store.injectCorruptLine("{not json");
    await ledger.record(usage("org/repo", "2026-10-14T08:01:00.000Z", { tokens: 7 }));
    expect(await ledger.usedInRange("org/repo", ...range)).toEqual({ tokens: 12 });
    expect(await ledger.usedThisWeek("org/repo")).toEqual({ tokens: 12 });
  });

  it("skips a line that fails isLedgerEntry and counts it", async () => {
    const { ledger, store } = setup();
    await ledger.record(usage("org/repo", "2026-10-14T08:00:00.000Z", { tokens: 5 }));
    store.injectCorruptLine(JSON.stringify({ v: 1, kind: "refund", subject: "org/repo" }));
    store.injectCorruptLine(JSON.stringify({ v: 1, kind: "usage", subject: "org/repo" }));
    expect(await ledger.usedThisWeek("org/repo")).toEqual({ tokens: 5 });
    expect(ledger.corruptSkipped).toBe(2);
  });

  it("an entry with an unknown future schema version is skipped, not misread", async () => {
    const { ledger, store } = setup();
    const future = { ...usage("org/repo", "2026-10-14T08:00:00.000Z", { tokens: 999 }), v: 2 };
    store.injectCorruptLine(JSON.stringify(future));
    await ledger.record(usage("org/repo", "2026-10-14T08:01:00.000Z", { tokens: 1 }));
    expect(await ledger.usedThisWeek("org/repo")).toEqual({ tokens: 1 });
    expect(ledger.corruptSkipped).toBe(1);
  });

  it("reports corrupt lines once per session, not on every read", async () => {
    const reports: number[] = [];
    const store = new InMemoryLedger();
    const clock = new FixedClock(NOW, "UTC");
    const ledger = new Ledger(store, clock, new BudgetCalendar(clock, "monday"), () => "id", {
      onCorrupt: (count) => reports.push(count),
    });
    await ledger.usedThisWeek("org/repo");
    expect(reports).toEqual([]);
    store.injectCorruptLine("{broken");
    await ledger.usedThisWeek("org/repo");
    await ledger.usedToday("org/repo");
    await ledger.subjectsSeen();
    store.injectCorruptLine("{broken again");
    await ledger.usedThisWeek("org/repo");
    expect(reports).toEqual([1]);
    expect(ledger.corruptSkipped).toBe(2);
  });

  it("a failing corrupt-report hook does not break the read", async () => {
    const store = new InMemoryLedger();
    const clock = new FixedClock(NOW, "UTC");
    const ledger = new Ledger(store, clock, new BudgetCalendar(clock, "monday"), () => "id", {
      onCorrupt: () => {
        throw new Error("hook failed");
      },
    });
    await ledger.record(usage("org/repo", "2026-10-14T08:00:00.000Z", { tokens: 3 }));
    store.injectCorruptLine("{broken");
    expect(await ledger.usedThisWeek("org/repo")).toEqual({ tokens: 3 });
  });
});

describe("Ledger.prune", () => {
  async function seeded() {
    const ctx = setup(); // now = 14 Oct 2026
    for (const month of ["2024-12", "2025-08", "2025-09", "2025-10", "2026-05", "2026-10"]) {
      await ctx.ledger.record(usage("org/repo", `${month}-15T08:00:00.000Z`, { tokens: 1 }));
    }
    return ctx;
  }

  it("removes months older than 13 months and keeps the rest", async () => {
    const { ledger, store } = await seeded();
    expect(await ledger.prune()).toEqual({ removed: ["2024-12", "2025-08"], failed: [] });
    expect(await store.months()).toEqual(["2025-09", "2025-10", "2026-05", "2026-10"]);
  });

  it("never touches the current month, however old the rest is", async () => {
    const { ledger, store } = setup();
    await ledger.record(usage("org/repo", "2020-01-15T08:00:00.000Z", { tokens: 1 }));
    await ledger.record(usage("org/repo", "2026-10-01T08:00:00.000Z", { tokens: 1 }));
    expect((await ledger.prune()).removed).toEqual(["2020-01"]);
    expect(await store.months()).toEqual(["2026-10"]);
  });

  it("uses the local month of the clock's time zone", async () => {
    const store = new InMemoryLedger();
    const clock = new FixedClock("2026-10-31T23:30:00.000Z", "Asia/Tokyo"); // already 1 Nov local
    const ledger = new Ledger(store, clock, new BudgetCalendar(clock, "monday"), () => "id");
    await ledger.record(usage("org/repo", "2025-10-15T08:00:00.000Z", { tokens: 1 }));
    // Local month is 2026-11, so the cutoff is 2025-10 and 2025-10 is kept.
    expect((await ledger.prune()).removed).toEqual([]);
    clock.set("2026-11-30T23:30:00.000Z"); // 1 Dec local: cutoff 2025-11
    expect((await ledger.prune()).removed).toEqual(["2025-10"]);
  });

  it("prunes across a year boundary", async () => {
    const store = new InMemoryLedger();
    const clock = new FixedClock("2026-01-10T09:00:00.000Z", "UTC");
    const ledger = new Ledger(store, clock, new BudgetCalendar(clock, "monday"), () => "id");
    for (const month of ["2024-11", "2024-12", "2025-01", "2025-12"]) {
      await ledger.record(usage("org/repo", `${month}-15T08:00:00.000Z`, { tokens: 1 }));
    }
    // 13 months before January 2026 is December 2024, which is kept.
    expect((await ledger.prune()).removed).toEqual(["2024-11"]);
    expect(await store.months()).toEqual(["2024-12", "2025-01", "2025-12"]);
  });

  it("keeps going when one month cannot be removed, and reports it", async () => {
    const { ledger, store } = await seeded();
    const original = store.removeMonth.bind(store);
    store.removeMonth = async (month) => {
      if (month === "2024-12") throw new Error("locked");
      return original(month);
    };
    expect(await ledger.prune()).toEqual({ removed: ["2025-08"], failed: ["2024-12"] });
  });

  it("is a no-op for an empty ledger", async () => {
    expect(await setup().ledger.prune()).toEqual({ removed: [], failed: [] });
  });
});

describe("Ledger and a changed resetDay", () => {
  async function weekOfEntries() {
    const store = new InMemoryLedger();
    const clock = new FixedClock("2026-10-14T09:00:00.000Z", "UTC"); // Wednesday
    const monday = new Ledger(store, clock, new BudgetCalendar(clock, "monday"), () => "m");
    const wednesday = new Ledger(store, clock, new BudgetCalendar(clock, "wednesday"), () => "w");
    for (const [day, tokens] of [
      ["2026-10-12", 1],
      ["2026-10-13", 2],
      ["2026-10-14", 4],
      ["2026-10-17", 8],
      ["2026-10-20", 16],
      ["2026-10-21", 32],
    ] as const) {
      await monday.record(usage("org/repo", `${day}T08:00:00.000Z`, { tokens }));
    }
    return { monday, wednesday };
  }

  it("changing resetDay from monday to wednesday mid-week counts exactly the entries inside the new window", async () => {
    const { monday, wednesday } = await weekOfEntries();
    expect(await monday.usedThisWeek("org/repo")).toEqual({ tokens: 1 + 2 + 4 + 8 }); // 12-18 Oct
    expect(await wednesday.usedThisWeek("org/repo")).toEqual({ tokens: 4 + 8 + 16 }); // 14-20 Oct
  });

  it("no entry is ever counted twice when windows overlap after a resetDay change", async () => {
    const { monday, wednesday } = await weekOfEntries();
    // The old week up to the change, then the new week from the change: a partition.
    const before = await monday.usedInRange("org/repo", "2026-10-12", "2026-10-14");
    const after = await wednesday.usedThisWeek("org/repo");
    expect(before.tokens + after.tokens).toBe(1 + 2 + 4 + 8 + 16);
    // And one query never repeats an entry, however the windows overlap.
    const everything = await monday.usedInRange("org/repo", "2026-10-01", "2026-11-01");
    expect(everything).toEqual({ tokens: 63 });
  });
});

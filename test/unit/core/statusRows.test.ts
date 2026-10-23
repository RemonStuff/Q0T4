import { describe, expect, it } from "vitest";
import { buildStatusRows } from "../../../src/core/statusRows";
import type { StatusLedger } from "../../../src/core/statusRows";
import { parseConfig } from "../../../src/core/subjects/parseConfig";
import type { Cost } from "../../../src/core/types";

class FakeStatusLedger implements StatusLedger {
  seenSince: string[] = [];
  constructor(
    private readonly week: Record<string, { used: Cost; requests: number }> = {},
    private readonly today: Record<string, Cost> = {},
    private readonly seen: string[] = [],
  ) {}
  async subjectsSeen(since?: string) {
    this.seenSince.push(since ?? "");
    return this.seen;
  }
  async weekUsage(subject: string) {
    return this.week[subject] ?? { used: { tokens: 0 }, requests: 0 };
  }
  async usedToday(subject: string) {
    return this.today[subject] ?? { tokens: 0 };
  }
}

const config = parseConfig({
  subjects: { "org/own": { weeklyLimit: 50_000 } },
  defaultLimit: 120_000,
  fallbackSubject: "general",
}).config;

const base = { config, weekStart: "2026-10-19", currentRepo: undefined };

describe("buildStatusRows", () => {
  it("has a row for configured, fallback, seen, current and extra subjects", async () => {
    const rows = await buildStatusRows({
      ...base,
      ledger: new FakeStatusLedger({}, {}, ["org/seen"]),
      currentRepo: "org/now",
      extra: ["org/last"],
    });
    expect(rows.map((r) => r.subject).sort()).toEqual(
      ["general", "org/last", "org/now", "org/own", "org/seen"].sort(),
    );
  });

  it("asks the ledger for subjects since the start of the week", async () => {
    const ledger = new FakeStatusLedger();
    await buildStatusRows({ ...base, ledger });
    expect(ledger.seenSince).toEqual(["2026-10-19"]);
  });

  it("fills used, today and requests from the ledger", async () => {
    const rows = await buildStatusRows({
      ...base,
      ledger: new FakeStatusLedger(
        { "org/own": { used: { tokens: 700 }, requests: 3 } },
        { "org/own": { tokens: 200 } },
      ),
    });
    expect(rows.find((r) => r.subject === "org/own")).toMatchObject({
      used: { tokens: 700 },
      today: { tokens: 200 },
      requests: 3,
    });
  });

  it("gives a subject its own limit, others defaultLimit marked as default", async () => {
    const rows = await buildStatusRows({
      ...base,
      ledger: new FakeStatusLedger(),
      extra: ["org/x"],
    });
    expect(rows.find((r) => r.subject === "org/own")).toMatchObject({
      budget: { tokens: 50_000 },
      limitIsDefault: false,
    });
    expect(rows.find((r) => r.subject === "org/x")).toMatchObject({
      budget: { tokens: 120_000 },
      limitIsDefault: true,
    });
  });

  it("marks the current repo, ignoring case", async () => {
    const rows = await buildStatusRows({
      ...base,
      ledger: new FakeStatusLedger(),
      currentRepo: "ORG/Own",
    });
    expect(rows.filter((r) => r.current).map((r) => r.subject)).toEqual(["org/own"]);
  });

  it("marks nothing as current without an open folder", async () => {
    const rows = await buildStatusRows({ ...base, ledger: new FakeStatusLedger() });
    expect(rows.some((r) => r.current)).toBe(false);
  });

  it("applies a limit override to every subject", async () => {
    const rows = await buildStatusRows({
      ...base,
      ledger: new FakeStatusLedger(),
      limitOverride: 900,
    });
    expect(rows.every((r) => r.budget.tokens === 900 && !r.limitIsDefault)).toBe(true);
  });

  it("lets a ledger failure through", async () => {
    const ledger = new FakeStatusLedger();
    ledger.subjectsSeen = async () => {
      throw new Error("disk");
    };
    await expect(buildStatusRows({ ...base, ledger })).rejects.toThrow("disk");
  });
});

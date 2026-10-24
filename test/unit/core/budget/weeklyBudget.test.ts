import { describe, expect, it } from "vitest";
import { FixedWeeklyBudget, PoolWeeklyBudget } from "../../../../src/core/budget/weeklyBudget";
import { Ledger } from "../../../../src/core/ledger/ledger";
import { BudgetCalendar } from "../../../../src/core/time/budgetCalendar";
import type { BudgetUnit, LedgerEntry, ResetDay } from "../../../../src/core/types";
import { FixedClock, InMemoryLedger } from "../../../fakes";

let counter = 0;

// With the cycle on the 1st and weeks on Thursday, 2026-10-01 is both a cycle and a week start.
function setup(
  options: {
    now?: string;
    unit?: BudgetUnit;
    share?: () => number;
    resetDay?: ResetDay;
    store?: InMemoryLedger;
  } = {},
) {
  const clock = new FixedClock(options.now ?? "2026-10-01T09:00:00Z");
  const calendar = new BudgetCalendar(clock, options.resetDay ?? "thursday", 1);
  const store = options.store ?? new InMemoryLedger();
  const ledger = new Ledger(store, clock, calendar, () => `id-${++counter}`);
  let share = 15_000;
  const budget = new PoolWeeklyBudget({
    ledger,
    calendar,
    clock,
    unit: () => options.unit ?? "credits",
    monthlyShare: options.share ?? (() => share),
  });
  const spend = (subject: string, amount: number, at: string, unit: BudgetUnit = "credits") =>
    ledger.record({
      v: 1,
      id: `${subject}-${at}-${amount}`,
      kind: "usage",
      at,
      day: at.slice(0, 10),
      subject,
      source: "q0t4",
      model: { name: "M", family: "m" },
      tokens: { input: 1, output: 1 },
      cost: unit === "credits" ? { tokens: 2, credits: amount } : { tokens: amount },
      stopped: false,
    });
  return { clock, calendar, store, ledger, budget, spend, setShare: (v: number) => (share = v) };
}

describe("PoolWeeklyBudget", () => {
  it("first week of a 31-day cycle that starts on the week's first day: share × 7/31", async () => {
    const t = setup();
    expect(await t.budget.forSubject("org/a")).toBeCloseTo((15_000 * 7) / 31, 9);
  });

  it("unused budget spreads: after spending nothing in week 1, week 2 gets remaining × 7/24", async () => {
    const t = setup();
    await t.budget.forSubject("org/a");
    t.clock.set("2026-10-08T09:00:00Z");
    expect(await t.budget.forSubject("org/a")).toBeCloseTo((15_000 * 7) / 24, 9);
  });

  it("overspending lowers later weeks", async () => {
    const t = setup();
    await t.budget.forSubject("org/a");
    await t.spend("org/a", 5_000, "2026-10-03T10:00:00Z");
    t.clock.set("2026-10-08T09:00:00Z");
    expect(await t.budget.forSubject("org/a")).toBeCloseTo((10_000 * 7) / 24, 9);
  });

  it("a subject that overspent its whole share gets 0, never a negative budget", async () => {
    const t = setup();
    await t.spend("org/a", 20_000, "2026-10-03T10:00:00Z");
    t.clock.set("2026-10-08T09:00:00Z");
    expect(await t.budget.forSubject("org/a")).toBe(0);
  });

  it("ignores other subjects' usage, and matches the subject case-insensitively", async () => {
    const t = setup();
    await t.spend("org/b", 5_000, "2026-10-03T10:00:00Z");
    await t.spend("ORG/A", 3_000, "2026-10-03T10:00:00Z");
    t.clock.set("2026-10-08T09:00:00Z");
    expect(await t.budget.forSubject("org/a")).toBeCloseTo((12_000 * 7) / 24, 9);
  });

  it("nothing carries over: the first week of a new cycle ignores last cycle's leftovers", async () => {
    const t = setup({ now: "2026-11-05T09:00:00Z" });
    await t.spend("org/a", 14_000, "2026-10-20T10:00:00Z");
    expect(await t.budget.forSubject("org/a")).toBeCloseTo((15_000 * 7) / 26, 9);
  });

  it("a week spanning the cycle end gets the old-cycle part plus the new-cycle part, split by days", async () => {
    const t = setup({ now: "2026-10-29T09:00:00Z" });
    await t.spend("org/a", 6_000, "2026-10-10T10:00:00Z");
    // Old cycle: (15,000 − 6,000) × 3/3 days left. New cycle: 15,000 × 4/30.
    expect(await t.budget.forSubject("org/a")).toBeCloseTo(9_000 + 2_000, 9);
  });

  it("a week with its cycle starting mid-week (Monday weeks) gets share × days/cycle days for the new part", async () => {
    const t = setup({ now: "2026-10-26T09:00:00Z", resetDay: "monday" });
    // Old cycle: 15,000 × 6/6. New cycle: 15,000 × 1/30.
    expect(await t.budget.forSubject("org/a")).toBeCloseTo(15_000 + 500, 9);
  });

  it("is fixed for the week: requests during the week do not change it", async () => {
    const t = setup();
    const first = await t.budget.forSubject("org/a");
    await t.spend("org/a", 1_000, "2026-10-02T10:00:00Z");
    t.clock.set("2026-10-05T09:00:00Z");
    expect(await t.budget.forSubject("org/a")).toBe(first);
    const snapshots = (await t.store.read({ from: "2026-10-01", to: "2026-10-08" })).entries.filter(
      (e) => e.kind === "budget",
    );
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({ week: "2026-10-01", unit: "credits", subject: "org/a" });
  });

  it("is computed from usage before the week starts, so two windows get the same value", async () => {
    const store = new InMemoryLedger();
    const one = setup({ store, now: "2026-10-08T09:00:00Z" });
    const two = setup({ store: store.writer("writer-2"), now: "2026-10-09T15:00:00Z" });
    await one.spend("org/a", 4_000, "2026-10-03T10:00:00Z");
    await one.spend("org/a", 9_000, "2026-10-08T08:00:00Z"); // inside the week: not counted
    expect(await one.budget.forSubject("org/a")).toBeCloseTo((11_000 * 7) / 24, 9);
    expect(await two.budget.forSubject("org/a")).toBeCloseTo((11_000 * 7) / 24, 9);
  });

  it("with two snapshots for one week, the earliest wins", async () => {
    const t = setup();
    const entry = (id: string, at: string, amount: number): LedgerEntry => ({
      v: 1,
      id,
      kind: "budget",
      at,
      day: at.slice(0, 10),
      subject: "org/a",
      source: "q0t4",
      week: "2026-10-01",
      unit: "credits",
      amount,
    });
    await t.ledger.record(entry("late", "2026-10-02T10:00:00Z", 999));
    await t.ledger.record(entry("early", "2026-10-01T08:00:00Z", 123));
    expect(await t.budget.forSubject("org/a")).toBe(123);
  });

  it("keeps a snapshot per unit", async () => {
    const t = setup();
    const credits = await t.budget.forSubject("org/a");
    const tokens = setup({ store: t.store, unit: "tokens", share: () => 700_000 });
    expect(await tokens.budget.forSubject("org/a")).toBeCloseTo((700_000 * 7) / 31, 6);
    expect(await t.budget.forSubject("org/a")).toBe(credits);
  });

  it("a share change mid-week applies from next week", async () => {
    const t = setup();
    const first = await t.budget.forSubject("org/a");
    t.setShare(31_000);
    t.clock.set("2026-10-04T09:00:00Z");
    expect(await t.budget.forSubject("org/a")).toBe(first);
    t.clock.set("2026-10-08T09:00:00Z");
    expect(await t.budget.forSubject("org/a")).toBeCloseTo((31_000 * 7) / 24, 9);
  });

  it("works in tokens too, counting tokens and not credits", async () => {
    const t = setup({ unit: "tokens", share: () => 1_000_000 });
    await t.spend("org/a", 240_000, "2026-10-03T10:00:00Z", "tokens");
    await t.spend("org/a", 5, "2026-10-04T10:00:00Z", "credits"); // 2 tokens, 5 credits
    t.clock.set("2026-10-08T09:00:00Z");
    expect(await t.budget.forSubject("org/a")).toBeCloseTo((759_998 * 7) / 24, 6);
  });

  it("counts a token-only week as 0 credits", async () => {
    const t = setup();
    await t.spend("org/a", 100_000, "2026-10-03T10:00:00Z", "tokens");
    t.clock.set("2026-10-08T09:00:00Z");
    expect(await t.budget.forSubject("org/a")).toBeCloseTo((15_000 * 7) / 24, 9);
  });

  it("returns the computed value when the snapshot can't be read back", async () => {
    const store = new InMemoryLedger();
    store.append = async () => undefined; // drops the write
    const t = setup({ store });
    expect(await t.budget.forSubject("org/a")).toBeCloseTo((15_000 * 7) / 31, 9);
  });
});

describe("FixedWeeklyBudget", () => {
  it("without a pool the weekly budget is the subject's fixed limit", async () => {
    const budget = new FixedWeeklyBudget((subject) => (subject === "org/a" ? 123 : 456));
    expect(await budget.forSubject("org/a")).toBe(123);
    expect(await budget.forSubject("org/b")).toBe(456);
  });
});
